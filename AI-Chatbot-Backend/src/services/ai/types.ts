/**
 * Provider-neutral AI contracts for the Class 3 tutor.
 * All routes/services must use this interface ,  never call a vendor SDK directly.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface TutorChatMessage {
  role: ChatRole;
  content: string | Array<Record<string, unknown>>;
}

export interface TutorGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseFormat?: { type: 'json_object' } | null;
  signal?: AbortSignal;
}

export interface NormalizedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface NormalizedGeneration {
  text: string;
  stopReason: string;
  provider: string;
  model: string;
  requestId: string;
  latencyMs: number;
  usage: NormalizedUsage;
}

export type StreamEventType = 'token' | 'done' | 'error';

export interface ProviderStreamChunk {
  type: StreamEventType;
  content?: string;
  usage?: NormalizedUsage;
  finishReason?: string;
  error?: string;
  errorCode?: ProviderErrorCode;
}

export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'AUTH_FAILED'
  | 'PROVIDER_OUTAGE'
  | 'EMPTY_OUTPUT'
  | 'BAD_STRUCTURED_OUTPUT'
  | 'UNSUPPORTED_FEATURE'
  | 'UNKNOWN';

export class ProviderError extends Error {
  code: ProviderErrorCode;
  provider: string;
  status?: number;
  retryable: boolean;
  constructor(opts: { code: ProviderErrorCode; message: string; provider: string; status?: number; retryable?: boolean }) {
    super(opts.message);
    this.name = 'ProviderError';
    this.code = opts.code;
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

export interface ProviderCapabilities {
  text: boolean;
  structuredOutput: boolean;
  vision: boolean;
  streaming: boolean;
}

/** One adapter per vendor. Must normalize text/usage/errors. */
export interface TutorProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  complete(messages: TutorChatMessage[], options?: TutorGenerateOptions): Promise<NormalizedGeneration>;
  stream(messages: TutorChatMessage[], options?: TutorGenerateOptions): AsyncGenerator<ProviderStreamChunk, void, void>;
  /** Validates connectivity without leaking secrets. Returns latency. */
  validateConnection?(timeoutMs?: number): Promise<{ ok: boolean; latencyMs: number; model?: string }>;
}

export function classifyHttpError(status: number): { code: ProviderErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: 'AUTH_FAILED', retryable: false };
  if (status === 429) return { code: 'RATE_LIMIT', retryable: true };
  if (status === 402 || status === 413) return { code: 'QUOTA_EXHAUSTED', retryable: true };
  if (status >= 500) return { code: 'PROVIDER_OUTAGE', retryable: true };
  return { code: 'UNKNOWN', retryable: false };
}

export function withTimeoutSignal(ms: number, external?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('AI request timed out')), ms);
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}
