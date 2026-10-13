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

function toGeminiContents(messages: TutorChatMessage[]): { systemInstruction?: unknown; contents: unknown[] } {
  const systemParts: string[] = [];
  const contents: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
      continue;
    }
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    contents.push({ role, parts: [{ text }] });
  }
  return {
    ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join('\n\n') }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }],
  };
}

/** Direct Google Gemini (Generative Language API) adapter. */
export class GeminiProvider implements TutorProvider {
  readonly id = 'gemini';
  readonly displayName = 'Google Gemini';
  readonly capabilities: ProviderCapabilities = { text: true, structuredOutput: true, vision: true, streaming: true };

  private async apiKey(): Promise<string> {
    const values = await settingsService.loadValues(['ai.geminiApiKey']);
    const fromDb = String(values['ai.geminiApiKey'] ?? '');
    const key = fromDb || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    if (!key) throw new ProviderError({ code: 'AUTH_FAILED', message: 'Gemini API key is not configured', provider: this.id });
    return key;
  }

  private model(override?: string): string {
    return override || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  async complete(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): Promise<NormalizedGeneration> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const model = this.model(options.model);
    const { signal, cancel } = withTimeoutSignal(options.timeoutMs ?? 45000, options.signal);
    try {
      const { systemInstruction, contents } = toGeminiContents(messages);
      const key = await this.apiKey();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(systemInstruction ? { systemInstruction } : {}),
            contents,
            generationConfig: {
              temperature: options.temperature ?? 0.3,
              maxOutputTokens: options.maxTokens ?? 700,
              ...(options.responseFormat ? { responseMimeType: 'application/json' } : {}),
            },
          }),
          signal,
        }
      );
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      } | null;
      if (!response.ok) {
        const { code, retryable } = classifyHttpError(response.status);
        throw new ProviderError({ code, message: data?.error?.message || `Gemini request failed (${response.status})`, provider: this.id, status: response.status, retryable });
      }
      const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
      if (!text) throw new ProviderError({ code: 'EMPTY_OUTPUT', message: 'Gemini returned an empty response', provider: this.id });
      return {
        text,
        stopReason: data?.candidates?.[0]?.finishReason || 'stop',
        provider: this.id,
        model,
        requestId,
        latencyMs: Date.now() - started,
        usage: {
          promptTokens: data?.usageMetadata?.promptTokenCount || 0,
          completionTokens: data?.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data?.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const err = error as Error;
      if (err?.name === 'AbortError') throw new ProviderError({ code: 'TIMEOUT', message: 'Gemini request timed out', provider: this.id, retryable: true });
      throw new ProviderError({ code: 'PROVIDER_OUTAGE', message: err?.message || 'Gemini request failed', provider: this.id, retryable: true });
    } finally {
      cancel();
    }
  }

  async *stream(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): AsyncGenerator<ProviderStreamChunk, void, void> {
    const model = this.model(options.model);
    let key: string;
    try {
      key = await this.apiKey();
    } catch (error) {
      yield { type: 'error', error: (error as Error).message, errorCode: 'AUTH_FAILED' };
      return;
    }
    const { systemInstruction, contents } = toGeminiContents(messages);
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(systemInstruction ? { systemInstruction } : {}),
            contents,
            generationConfig: { temperature: options.temperature ?? 0.3, maxOutputTokens: options.maxTokens ?? 700 },
          }),
          signal: options.signal,
        }
      );
    } catch (error) {
      yield { type: 'error', error: (error as Error)?.message || 'Stream failed', errorCode: 'PROVIDER_OUTAGE' };
      return;
    }
    if (!response.ok || !response.body) {
      yield { type: 'error', error: `Gemini request failed (${response.status})`, errorCode: classifyHttpError(response.status).code };
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
            const json = JSON.parse(payload) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
            const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
            if (text) yield { type: 'token', content: text };
          } catch { /* ignore */ }
        }
      }
      yield { type: 'done', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    } catch (error) {
      log.error('Gemini stream error', { message: (error as Error)?.message });
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

export default GeminiProvider;
