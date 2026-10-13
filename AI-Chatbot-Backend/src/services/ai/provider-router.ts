import crypto from 'crypto';
import { NormalizedGeneration, ProviderError, ProviderStreamChunk, TutorChatMessage, TutorGenerateOptions } from './types';
import providerRegistry from './provider-registry';
import { isAllowlisted, capabilitiesFor } from './capabilities';
import { settingsService } from '../settings.service';
import { log } from '../../config/logger';

export interface RouterResolution {
  providerId: string;
  model: string;
  fallbacks: Array<{ providerId: string; model: string }>;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

const RETRYABLE = new Set(['TIMEOUT', 'RATE_LIMIT', 'QUOTA_EXHAUSTED', 'PROVIDER_OUTAGE']);
const MAX_ATTEMPTS = 3;

/** Resolves active provider/model + verified fallback list from DB settings. */
export async function resolveRouterConfig(override?: { providerId?: string; model?: string }): Promise<RouterResolution> {
  const values = await settingsService.loadValues([
    'ai.provider',
    'ai.model',
    'ai.temperature',
    'ai.maxTokens',
    'ai.timeoutMs',
    'ai.fallbacks',
  ]);
  const providerId = override?.providerId || String(values['ai.provider'] ?? 'openrouter');
  const model = override?.model || String(values['ai.model'] ?? '');
  const temperature = Math.min(1, Math.max(0, Number(values['ai.temperature'] ?? 0.3)));
  const maxTokens = Math.min(4000, Math.max(64, Number(values['ai.maxTokens'] ?? 700)));
  const timeoutMs = Math.min(120000, Math.max(5000, Number(values['ai.timeoutMs'] ?? 45000)));
  let fallbacks: Array<{ providerId: string; model: string }> = [];
  try {
    const raw = values['ai.fallbacks'];
    if (Array.isArray(raw)) fallbacks = raw as Array<{ providerId: string; model: string }>;
    else if (typeof raw === 'string' && raw) fallbacks = JSON.parse(raw);
  } catch { fallbacks = []; }
  fallbacks = fallbacks
    .filter((f) => f && f.providerId && f.model)
    .filter((f) => !(f.providerId === providerId && f.model === model))
    .filter((f) => isAllowlisted(f.providerId, f.model))
    .slice(0, 3);
  return { providerId, model, fallbacks, temperature, maxTokens, timeoutMs };
}

function needsVision(messages: TutorChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content));
}

async function attemptComplete(
  providerId: string,
  model: string,
  messages: TutorChatMessage[],
  options: TutorGenerateOptions
): Promise<NormalizedGeneration> {
  const provider = providerRegistry.get(providerId);
  if (!provider) throw new ProviderError({ code: 'UNSUPPORTED_FEATURE', message: `Provider "${providerId}" is not implemented`, provider: providerId });
  if (!isAllowlisted(providerId, model)) {
    throw new ProviderError({ code: 'UNSUPPORTED_FEATURE', message: `Model "${model}" is not allowlisted for provider "${providerId}"`, provider: providerId });
  }
  if (needsVision(messages) && !provider.capabilities.vision && !capabilitiesFor(providerId, model).vision) {
    throw new ProviderError({ code: 'UNSUPPORTED_FEATURE', message: `Model "${model}" does not support image input`, provider: providerId });
  }
  return provider.complete(messages, { ...options, model });
}

/**
 * Generates text with bounded retries across the allowlisted fallback chain.
 * Only recoverable provider failures (timeout/rate-limit/quota/outage) fall
 * back. Auth/config errors fail fast. Every response records which
 * provider/model actually generated it (server-side logs + DB usage).
 */
export async function generateWithFallback(
  messages: TutorChatMessage[],
  options: TutorGenerateOptions & { providerId?: string; model?: string } = {}
): Promise<NormalizedGeneration & { fallbackUsed: boolean; attempts: Array<{ provider: string; model: string; error?: string }> }> {
  const config = await resolveRouterConfig({ providerId: options.providerId, model: options.model });
  const requestId = crypto.randomUUID();
  const chain = [{ providerId: config.providerId, model: config.model }, ...config.fallbacks].slice(0, MAX_ATTEMPTS + 1);
  const attempts: Array<{ provider: string; model: string; error?: string }> = [];
  let lastError: ProviderError | null = null;

  for (let i = 0; i < chain.length && i <= MAX_ATTEMPTS; i++) {
    const step = chain[i];
    try {
      const result = await attemptComplete(step.providerId, step.model, messages, {
        temperature: options.temperature ?? config.temperature,
        maxTokens: options.maxTokens ?? config.maxTokens,
        timeoutMs: options.timeoutMs ?? config.timeoutMs,
        responseFormat: options.responseFormat,
        signal: options.signal,
      });
      log.info('AI generation succeeded', {
        requestId,
        provider: result.provider,
        model: result.model,
        fallbackUsed: i > 0,
        latencyMs: result.latencyMs,
      });
      return { ...result, requestId: result.requestId || requestId, fallbackUsed: i > 0, attempts };
    } catch (error) {
      const err = error instanceof ProviderError ? error : new ProviderError({ code: 'UNKNOWN', message: (error as Error)?.message || 'AI failed', provider: step.providerId });
      lastError = err;
      attempts.push({ provider: step.providerId, model: step.model, error: `${err.code}: ${err.message}` });
      log.warn('AI attempt failed', { requestId, provider: step.providerId, model: step.model, code: err.code });
      // Only retry/fall back on recoverable errors. Auth/config/validation fail fast.
      if (!RETRYABLE.has(err.code)) break;
    }
  }
  throw lastError || new ProviderError({ code: 'PROVIDER_OUTAGE', message: 'All AI providers failed', provider: config.providerId, retryable: false });
}

/** Streams from the primary provider; falls back once on recoverable errors. */
export async function* streamWithFallback(
  messages: TutorChatMessage[],
  options: TutorGenerateOptions & { providerId?: string; model?: string } = {}
): AsyncGenerator<ProviderStreamChunk & { provider?: string; model?: string }, void, void> {
  const config = await resolveRouterConfig({ providerId: options.providerId, model: options.model });
  const chain = [{ providerId: config.providerId, model: config.model }, ...config.fallbacks].slice(0, 2);
  for (const step of chain) {
    const provider = providerRegistry.get(step.providerId);
    if (!provider) {
      yield { type: 'error', error: `Provider "${step.providerId}" is not implemented`, errorCode: 'UNSUPPORTED_FEATURE' };
      return;
    }
    if (!isAllowlisted(step.providerId, step.model)) {
      yield { type: 'error', error: `Model "${step.model}" is not allowlisted`, errorCode: 'UNSUPPORTED_FEATURE' };
      return;
    }
    let sawToken = false;
    let fallbackError: string | null = null;
    let fallbackCode: ProviderStreamChunk['errorCode'];
    for await (const chunk of provider.stream(messages, {
      temperature: options.temperature ?? config.temperature,
      maxTokens: options.maxTokens ?? config.maxTokens,
      timeoutMs: options.timeoutMs ?? config.timeoutMs,
      signal: options.signal,
      model: step.model,
    })) {
      if (chunk.type === 'token') {
        sawToken = true;
        yield { ...chunk, provider: step.providerId, model: step.model };
      } else if (chunk.type === 'done') {
        yield { ...chunk, provider: step.providerId, model: step.model };
        return;
      } else {
        // Recoverable pre-token errors may fall back once; post-token errors surface.
        if (!sawToken && (chunk.errorCode === 'RATE_LIMIT' || chunk.errorCode === 'QUOTA_EXHAUSTED' || chunk.errorCode === 'PROVIDER_OUTAGE' || chunk.errorCode === 'TIMEOUT')) {
          fallbackError = chunk.error || 'Provider failed';
          fallbackCode = chunk.errorCode;
          break;
        }
        yield { ...chunk, provider: step.providerId, model: step.model };
        return;
      }
    }
    if (fallbackError && step !== chain[chain.length - 1]) {
      log.warn('AI stream falling back', { from: step.providerId, error: fallbackError, code: fallbackCode });
      continue;
    }
    if (fallbackError) {
      yield { type: 'error', error: fallbackError, errorCode: fallbackCode, provider: step.providerId, model: step.model };
      return;
    }
    return;
  }
}

export const providerRouter = { resolveRouterConfig, generateWithFallback, streamWithFallback };
export default providerRouter;
