import { TutorProvider } from './types';
import OpenRouterProvider from './providers/openrouter.provider';
import AnthropicProvider from './providers/anthropic.provider';
import GeminiProvider from './providers/gemini.provider';
import CompatibleProvider from './providers/compatible.provider';
import MockProvider from './providers/mock.provider';

/** Single registry of implemented adapters. New vendors need one adapter here. */
class ProviderRegistry {
  private providers = new Map<string, TutorProvider>();

  constructor() {
    this.register(new OpenRouterProvider());
    this.register(new AnthropicProvider());
    this.register(new GeminiProvider());
    this.register(new CompatibleProvider());
    this.register(new MockProvider());
  }

  register(provider: TutorProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): TutorProvider | null {
    return this.providers.get(id) || null;
  }

  list(): TutorProvider[] {
    return Array.from(this.providers.values());
  }

  ids(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();
export default providerRegistry;
