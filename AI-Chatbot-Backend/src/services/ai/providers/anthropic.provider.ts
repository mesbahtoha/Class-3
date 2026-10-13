import crypto from 'crypto';
import {
  NormalizedGeneration,
  ProviderCapabilities,
  ProviderError,
  ProviderStreamChunk,
  TutorChatMessage,
  TutorGenerateOptions,
  TutorProvider,
  classifyHttpError,
  withTimeoutSignal,
} from '../types';
import { settingsService } from '../../settings.service';
import { log } from '../../../config/logger';

function toAnthropicMessages(messages: TutorChatMessage[]): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: unknown }> } {
  const systemParts: string[] = [];
  const rest: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
    } else {
      rest.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }
  }
  return { system: systemParts.join('\n\n') || undefined, messages: rest };
}

/** Direct Anthropic Messages API adapter (production use when configured). */
export class AnthropicProvider implements TutorProvider {
  readonly id = 'anthropic';
  readonly displayName = 'Anthropic';
  readonly capabilities: ProviderCapabilities = { text: true, structuredOutput: true, vision: true, streaming: true };

  private async apiKey(): Promise<string> {
    const values = await settingsService.loadValues(['ai.anthropicApiKey']);
    const fromDb = String(values['ai.anthropicApiKey'] ?? '');
    const key = fromDb || process.env.ANTHROPIC_API_KEY || '';
    if (!key) throw new ProviderError({ code: 'AUTH_FAILED', message: 'Anthropic API key is not configured', provider: this.id });
    return key;
  }

  private model(override?: string): string {
    return override || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  }

  async complete(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): Promise<NormalizedGeneration> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const model = this.model(options.model);
    const { signal, cancel } = withTimeoutSignal(options.timeoutMs ?? 45000, options.signal);
    try {
      const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': await this.apiKey(),
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 700,
          temperature: options.temperature ?? 0.3,
          ...(system ? { system } : {}),
          messages: anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: 'Hello' }],
        }),
        signal,
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        content?: Array<{ type?: string; text?: string }>;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      } | null;
      if (!response.ok) {
        const { code, retryable } = classifyHttpError(response.status);
        throw new ProviderError({ code, message: data?.error?.message || `Anthropic request failed (${response.status})`, provider: this.id, status: response.status, retryable });
      }
      const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('\n').trim();
      if (!text) throw new ProviderError({ code: 'EMPTY_OUTPUT', message: 'Anthropic returned an empty response', provider: this.id });
      return {
        text,
        stopReason: data?.stop_reason || 'stop',
        provider: this.id,
        model,
        requestId,
        latencyMs: Date.now() - started,
        usage: {
          promptTokens: data?.usage?.input_tokens || 0,
          completionTokens: data?.usage?.output_tokens || 0,
          totalTokens: (data?.usage?.input_tokens || 0) + (data?.usage?.output_tokens || 0),
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const err = error as Error;
      if (err?.name === 'AbortError') throw new ProviderError({ code: 'TIMEOUT', message: 'Anthropic request timed out', provider: this.id, retryable: true });
      throw new ProviderError({ code: 'PROVIDER_OUTAGE', message: err?.message || 'Anthropic request failed', provider: this.id, retryable: true });
    } finally {
      cancel();
    }
  }

  async *stream(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): AsyncGenerator<ProviderStreamChunk, void, void> {
    // Anthropic SSE mapped onto the neutral chunk shape.
    const model = this.model(options.model);
    let key: string;
    try {
      key = await this.apiKey();
    } catch (error) {
      yield { type: 'error', error: (error as Error).message, errorCode: 'AUTH_FAILED' };
      return;
    }
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 700,
          temperature: options.temperature ?? 0.3,
          stream: true,
          ...(system ? { system } : {}),
          messages: anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: 'Hello' }],
        }),
        signal: options.signal,
      });
    } catch (error) {
      yield { type: 'error', error: (error as Error)?.message || 'Stream failed', errorCode: 'PROVIDER_OUTAGE' };
      return;
    }
    if (!response.ok || !response.body) {
      yield { type: 'error', error: `Anthropic request failed (${response.status})`, errorCode: classifyHttpError(response.status).code };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
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
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload) as { type?: string; delta?: { text?: string }; message?: { usage?: { input_tokens?: number; output_tokens?: number } } };
            if (json.type === 'content_block_delta' && json.delta?.text) {
              yield { type: 'token', content: json.delta.text };
            }
          } catch { /* ignore */ }
        }
      }
      yield { type: 'done', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    } catch (error) {
      log.error('Anthropic stream error', { message: (error as Error)?.message });
      yield { type: 'error', error: (error as Error)?.message || 'Stream interrupted', errorCode: 'PROVIDER_OUTAGE' };
    } finally {
      reader.releaseLock();
    }
  }

  async validateConnection(timeoutMs = 15000): Promise<{ ok: boolean; latencyMs: number; model?: string }> {
    const started = Date.now();
    try {
      await this.complete([{ role: 'user', content: 'Reply with: ok' }], { maxTokens: 5, temperature: 0, timeoutMs });
      return { ok: true, latencyMs: Date.now() - started, model: this.model() };
    } catch {
      return { ok: false, latencyMs: Date.now() - started };
    }
  }
}

export default AnthropicProvider;
