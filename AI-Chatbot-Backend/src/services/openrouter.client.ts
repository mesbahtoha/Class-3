import env from '../config/env';
import { log } from '../config/logger';
import { settingsService } from './settings.service';

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface OpenRouterRequestOptions {
  /** Explicit key bypasses admin settings (used by offline jobs such as OCR). */
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' } | null;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Provider-reported cost in USD when available. */
  cost?: number;
}

export interface OpenRouterStreamChunk {
  type: 'token' | 'thinking' | 'done' | 'error';
  content?: string;
  usage?: OpenRouterUsage;
  finishReason?: string;
  error?: string;
}

/**
 * OpenRouter API client.
 * - Resolves the API key from settings first, then falls back to env.
 * - Both non-streaming completions and SSE streaming are supported.
 */
export class OpenRouterClient {
  /** Non-streaming completion. Returns the full text content. */
  static async complete(
    messages: ChatMessageInput[],
    options: OpenRouterRequestOptions = {}
  ): Promise<{ text: string; usage: OpenRouterUsage }> {
    const aiSettings = options.apiKey ? null : await settingsService.getAISettings();
    const apiKey = options.apiKey || aiSettings?.openRouterApiKey || env.openRouter.apiKey;
    if (!apiKey) throw new Error('OpenRouter API key is not configured');

    const response = await fetch(`${env.openRouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.appBaseUrl,
        'X-OpenRouter-Title': env.appTitle,
      },
      body: JSON.stringify({
        model: options.model || aiSettings?.model || env.openRouter.model,
        messages,
        temperature: options.temperature ?? aiSettings?.temperature ?? 0.15,
        max_tokens: options.maxTokens || aiSettings?.maxTokens || env.openRouter.maxTokens,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
      signal: options.signal,
    });

    const data = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
    } | null;

    if (!response.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        `OpenRouter request failed with status ${response.status}`;
      throw new Error(message);
    }

    const text = extractCompletionText(data as never);
    const usage = normalizeUsage(data as never);

    return { text, usage };
  }

  /**
   * Streaming completion. Consumes an async generator of parsed chunks.
   * Emits 'token' chunks as they arrive and a final 'done' chunk with usage.
   */
  static async *stream(
    messages: ChatMessageInput[],
    options: OpenRouterRequestOptions = {}
  ): AsyncGenerator<OpenRouterStreamChunk, void, void> {
    const aiSettings = options.apiKey ? null : await settingsService.getAISettings();
    const apiKey = options.apiKey || aiSettings?.openRouterApiKey || env.openRouter.apiKey;
    if (!apiKey) throw new Error('OpenRouter API key is not configured');

    const controller = new AbortController();
    const externalSignal = options.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const response = await fetch(`${env.openRouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.appBaseUrl,
        'X-OpenRouter-Title': env.appTitle,
      },
      body: JSON.stringify({
        model: options.model || aiSettings?.model || env.openRouter.model,
        messages,
        temperature: options.temperature ?? aiSettings?.temperature ?? 0.15,
        max_tokens: options.maxTokens || aiSettings?.maxTokens || env.openRouter.maxTokens,
        stream: true,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const bodyText = await response.text().catch(() => '');
      let message = `OpenRouter request failed with status ${response.status}`;
      try {
        const parsed = JSON.parse(bodyText);
        message = parsed?.error?.message || message;
      } catch {
        // fall through to default message
      }
      yield { type: 'error', error: message };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedUsage: OpenRouterUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
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
              choices?: Array<{
                delta?: { content?: string | Array<{ text?: string }> };
                finish_reason?: string | null;
              }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
              error?: { message?: string };
            };

            if (json.error?.message) {
              yield { type: 'error', error: json.error.message };
              return;
            }

            const choice = json.choices?.[0];
            if (choice?.delta?.content) {
              const delta = choice.delta.content;
              const text =
                typeof delta === 'string'
                  ? delta
                  : Array.isArray(delta)
                    ? delta.map((item) => item.text || '').join('')
                    : '';
              if (text) yield { type: 'token', content: text };
            }

            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }

            if (json.usage) {
              accumulatedUsage = normalizeUsage(json);
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      yield {
        type: 'done',
        finishReason,
        usage: accumulatedUsage,
      };
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'AbortError') {
        yield { type: 'done', finishReason: 'aborted', usage: accumulatedUsage };
        return;
      }
      log.error('OpenRouter stream error', { message: (error as Error)?.message });
      yield { type: 'error', error: (error as Error)?.message || 'Stream interrupted' };
    } finally {
      reader.releaseLock();
    }
  }
}

function extractCompletionText(json: {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
}): string {
  const content = json?.choices?.[0]?.message?.content;

  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.text) return item.text;
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function normalizeUsage(json: {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
}): OpenRouterUsage {
  const usage = json.usage || {};
  return {
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    ...(typeof usage.cost === 'number' ? { cost: usage.cost } : {}),
  };
}

export default OpenRouterClient;
