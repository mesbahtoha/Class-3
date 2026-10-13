import crypto from 'crypto';
import {
  NormalizedGeneration,
  ProviderCapabilities,
  ProviderStreamChunk,
  TutorChatMessage,
  TutorGenerateOptions,
  TutorProvider,
} from '../types';

/**
 * Mock provider for automated tests. Never calls external APIs.
 * Returns a deterministic Bengali-script tutor answer.
 */
export class MockProvider implements TutorProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock';
  readonly capabilities: ProviderCapabilities = { text: true, structuredOutput: true, vision: false, streaming: true };

  async complete(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): Promise<NormalizedGeneration> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const q = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content || '');
    const text = [
      'চলো সহজ করে শিখি!',
      '',
      'ধাপ ১: প্রশ্নটা আবার পড়ি।',
      'ধাপ ২: বইয়ের নিয়মটা মনে করি।',
      'ধাপ ৩: ছোট উদাহরণ দিয়ে বুঝি।',
      '',
      `তোমার প্রশ্ন ছিল: ${q.slice(0, 120)}`,
      'তুমি খুব ভালো চেষ্টা করছো! আর একবার চেষ্টা করো।',
    ].join('\n');
    return {
      text,
      stopReason: 'stop',
      provider: this.id,
      model: options.model || 'mock-tutor',
      requestId: crypto.randomUUID(),
      latencyMs: 1,
      usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
    };
  }

  async *stream(messages: TutorChatMessage[], options: TutorGenerateOptions = {}): AsyncGenerator<ProviderStreamChunk, void, void> {
    const result = await this.complete(messages, options);
    const words = result.text.split(' ');
    for (const word of words) {
      yield { type: 'token', content: `${word} ` };
    }
    yield { type: 'done', finishReason: 'stop', usage: result.usage };
  }

  async validateConnection(): Promise<{ ok: boolean; latencyMs: number; model?: string }> {
    return { ok: true, latencyMs: 1, model: 'mock-tutor' };
  }
}

export default MockProvider;
