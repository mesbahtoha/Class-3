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

/**
 * Generic OpenAI-compatible adapter. Only usable when the admin has verified
 * a real compatible endpoint ,  never assume an arbitrary LLM API is compatible.
 */
export class CompatibleProvider implements TutorProvider {
  readonly id = 'compatible';
  readonly displayName = 'OpenAI-compatible';
  readonly capabilities: ProviderCapabilities = { text: true, structuredOutput: true, vision: false, streaming: true };

  private async config(): Promise<{ baseUrl: string; apiKey: string; model: string }> {
    const values = await settingsService.loadValues(['ai.compatibleBaseUrl', 'ai.compatibleApiKey', 'ai.compatibleModel']);
    const baseUrl = String(values['ai.compatibleBaseUrl'] ?? process.env.COMPATIBLE_BASE_URL ?? '').replace(/\/$/, '');
    const apiKey = String(values['ai.compatibleApiKey'] ?? process.env.COMPATIBLE_API_KEY ?? '');
    const model = String(values['ai.compatibleModel'] ?? process.env.COMPATIBLE_MODEL ?? '');
    if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
      throw new ProviderError({ code: 'UNSUPPORTED_FEATURE', message: 'Compatible endpoint is not configured or is not a valid http(s) URL', provider: this.id });
    }
    if (!apiKey) throw new ProviderError({ code: 'AUTH_FAILED', message: 'Compatible endpoint API key is not configured', provider: this.id });
    if (!model) throw new ProviderError({ code: 'UNSUPPORTED_FEATURE', message: 'Compatible model is not configured', provider: this.id });
    return { baseUrl, apiKey, model };
  }

  async complete(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): Promise<NormalizedGeneration> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const { baseUrl, apiKey, model: configured } = await this.config();
    const model = options.model && options.model !== 'custom' ? options.model : configured;
    const { signal, cancel } = withTimeoutSignal(options.timeoutMs ?? 45000, options.signal);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 700,
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        }),
        signal,
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string }; message?: string;
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      } | null;
      if (!response.ok) {
        const { code, retryable } = classifyHttpError(response.status);
        throw new ProviderError({ code, message: data?.error?.message || `Compatible endpoint failed (${response.status})`, provider: this.id, status: response.status, retryable });
      }
      const text = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new ProviderError({ code: 'EMPTY_OUTPUT', message: 'Compatible endpoint returned an empty response', provider: this.id });
      return {
        text,
        stopReason: data?.choices?.[0]?.finish_reason || 'stop',
        provider: this.id,
        model,
        requestId,
        latencyMs: Date.now() - started,
        usage: {
          promptTokens: data?.usage?.prompt_tokens || 0,
          completionTokens: data?.usage?.completion_tokens || 0,
          totalTokens: data?.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const err = error as Error;
      if (err?.name === 'AbortError') throw new ProviderError({ code: 'TIMEOUT', message: 'Compatible endpoint timed out', provider: this.id, retryable: true });
      throw new ProviderError({ code: 'PROVIDER_OUTAGE', message: err?.message || 'Compatible endpoint failed', provider: this.id, retryable: true });
    } finally {
      cancel();
    }
  }

  async *stream(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): AsyncGenerator<ProviderStreamChunk, void, void> {
    let cfg;
    try {
      cfg = await this.config();
    } catch (error) {
      yield { type: 'error', error: (error as Error).message, errorCode: (error as ProviderError).code || 'UNSUPPORTED_FEATURE' };
      return;
    }
    const model = options.model && options.model !== 'custom' ? options.model : cfg.model;
    let response: Response;
    try {
      response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 700,
          stream: true,
        }),
        signal: options.signal,
      });
    } catch (error) {
      yield { type: 'error', error: (error as Error)?.message || 'Stream failed', errorCode: 'PROVIDER_OUTAGE' };
      return;
    }
    if (!response.ok || !response.body) {
      yield { type: 'error', error: `Compatible endpoint failed (${response.status})`, errorCode: classifyHttpError(response.status).code };
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
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]' || !payload) continue;
          try {
            const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const text = json.choices?.[0]?.delta?.content;
            if (text) yield { type: 'token', content: text };
          } catch { /* ignore */ }
        }
      }
      yield { type: 'done', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    } catch (error) {
      yield { type: 'error', error: (error as Error)?.message || 'Stream interrupted', errorCode: 'PROVIDER_OUTAGE' };
    } finally {
      reader.releaseLock();
    }
  }

  async validateConnection(timeoutMs = 15000): Promise<{ ok: boolean; latencyMs: number; model?: string }> {
    const started = Date.now();
    try {
      const cfg = await this.config();
      await this.complete([{ role: 'user', content: 'Reply with: ok' }], { maxTokens: 5, temperature: 0, timeoutMs });
      return { ok: true, latencyMs: Date.now() - started, model: cfg.model };
    } catch {
      return { ok: false, latencyMs: Date.now() - started };
    }
  }
}

export default CompatibleProvider;
