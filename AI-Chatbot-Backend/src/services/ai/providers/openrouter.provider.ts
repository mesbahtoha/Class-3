import crypto from 'crypto';
import {
  NormalizedGeneration,
  NormalizedUsage,
  ProviderCapabilities,
  ProviderError,
  ProviderStreamChunk,
  TutorChatMessage,
  TutorGenerateOptions,
  TutorProvider,
  classifyHttpError,
  withTimeoutSignal,
} from '../types';
import env from '../../../config/env';
import { settingsService } from '../../settings.service';
import { log } from '../../../config/logger';

function normalizeUsage(json: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }): NormalizedUsage {
  const u = json.usage || {};
  return {
    promptTokens: u.prompt_tokens || 0,
    completionTokens: u.completion_tokens || 0,
    totalTokens: u.total_tokens || 0,
  };
}

function extractText(json: { choices?: Array<{ message?: { content?: unknown } }> }): string {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return (content as Array<{ text?: string } | string>)
      .map((item) => (typeof item === 'string' ? item : item?.text || ''))
      .join('\n')
      .trim();
  }
  return '';
}

async function resolveApiKey(): Promise<string> {
  const ai = await settingsService.getAISettings();
  return ai.openRouterApiKey || env.openRouter.apiKey;
}

async function resolveModel(override?: string): Promise<string> {
  if (override) return override;
  const ai = await settingsService.getAISettings();
  return ai.model || env.openRouter.model;
}

/**
 * OpenRouter adapter ,  reuses the project's working OpenRouter integration
 * (chat/completions + SSE) behind the provider-neutral interface.
 */
export class OpenRouterProvider implements TutorProvider {
  readonly id = 'openrouter';
  readonly displayName = 'OpenRouter';
  readonly capabilities: ProviderCapabilities = { text: true, structuredOutput: true, vision: true, streaming: true };

  private baseUrl(): string {
    return env.openRouter.baseUrl;
  }

  private async headers(): Promise<Record<string, string>> {
    const apiKey = await resolveApiKey();
    if (!apiKey) throw new ProviderError({ code: 'AUTH_FAILED', message: 'OpenRouter API key is not configured', provider: this.id });
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.appBaseUrl,
      'X-OpenRouter-Title': env.appTitle,
    };
  }

  async complete(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): Promise<NormalizedGeneration> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const model = await resolveModel(options.model);
    const ai = await settingsService.getAISettings();
    const timeoutMs = options.timeoutMs ?? 45000;
    const { signal, cancel } = withTimeoutSignal(timeoutMs, options.signal);
    try {
      const response = await fetch(`${this.baseUrl()}/chat/completions`, {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? ai.temperature ?? 0.3,
          max_tokens: options.maxTokens || ai.maxTokens || env.openRouter.maxTokens,
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        }),
        signal,
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        message?: string;
        choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      } | null;
      if (!response.ok) {
        const { code, retryable } = classifyHttpError(response.status);
        throw new ProviderError({
          code,
          message: data?.error?.message || data?.message || `OpenRouter request failed (${response.status})`,
          provider: this.id,
          status: response.status,
          retryable,
        });
      }
      const text = extractText(data as never);
      if (!text) throw new ProviderError({ code: 'EMPTY_OUTPUT', message: 'OpenRouter returned an empty response', provider: this.id });
      return {
        text,
        stopReason: (data?.choices?.[0] as { finish_reason?: string })?.finish_reason || 'stop',
        provider: this.id,
        model,
        requestId,
        latencyMs: Date.now() - started,
        usage: normalizeUsage(data as never),
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const err = error as Error;
      if (err?.name === 'AbortError' || /timed out/i.test(err?.message || '')) {
        throw new ProviderError({ code: 'TIMEOUT', message: 'OpenRouter request timed out', provider: this.id, retryable: true });
      }
      throw new ProviderError({ code: 'PROVIDER_OUTAGE', message: err?.message || 'OpenRouter request failed', provider: this.id, retryable: true });
    } finally {
      cancel();
    }
  }

  async *stream(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): AsyncGenerator<ProviderStreamChunk, void, void> {
    const model = await resolveModel(options.model);
    const ai = await settingsService.getAISettings();
    let headers: Record<string, string>;
    try {
      headers = await this.headers();
    } catch (error) {
      yield { type: 'error', error: (error as Error).message, errorCode: 'AUTH_FAILED' };
      return;
    }
    const controller = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? ai.temperature ?? 0.3,
          max_tokens: options.maxTokens || ai.maxTokens || env.openRouter.maxTokens,
          stream: true,
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'AbortError') {
        yield { type: 'done', finishReason: 'aborted', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
        return;
      }
      yield { type: 'error', error: (error as Error)?.message || 'Stream failed', errorCode: 'PROVIDER_OUTAGE' };
      return;
    }
    if (!response.ok || !response.body) {
      const bodyText = await response.text().catch(() => '');
      let message = `OpenRouter request failed (${response.status})`;
      let code = classifyHttpError(response.status).code;
      try {
        const parsed = JSON.parse(bodyText);
        message = parsed?.error?.message || message;
      } catch { /* keep default */ }
      yield { type: 'error', error: message, errorCode: code };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage: NormalizedUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason = 'stop';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> }; finish_reason?: string | null }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
              error?: { message?: string };
            };
            if (json.error?.message) {
              yield { type: 'error', error: json.error.message, errorCode: 'PROVIDER_OUTAGE' };
              return;
            }
            const choice = json.choices?.[0];
            if (choice?.delta?.content) {
              const delta = choice.delta.content;
              const text = typeof delta === 'string' ? delta : Array.isArray(delta) ? delta.map((i) => i.text || '').join('') : '';
              if (text) yield { type: 'token', content: text };
            }
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            if (json.usage) usage = normalizeUsage(json);
          } catch { /* ignore malformed SSE lines */ }
        }
      }
      yield { type: 'done', finishReason, usage };
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'AbortError') {
        yield { type: 'done', finishReason: 'aborted', usage };
        return;
      }
      log.error('OpenRouter stream error', { message: (error as Error)?.message });
      yield { type: 'error', error: (error as Error)?.message || 'Stream interrupted', errorCode: 'PROVIDER_OUTAGE' };
    } finally {
      reader.releaseLock();
    }
  }

  async validateConnection(timeoutMs = 15000): Promise<{ ok: boolean; latencyMs: number; model?: string }> {
    const started = Date.now();
    try {
      const model = await resolveModel();
      await this.complete([{ role: 'user', content: 'Reply with: ok' }], { maxTokens: 5, temperature: 0, timeoutMs, model });
      return { ok: true, latencyMs: Date.now() - started, model };
    } catch {
      return { ok: false, latencyMs: Date.now() - started };
    }
  }
}

export default OpenRouterProvider;
