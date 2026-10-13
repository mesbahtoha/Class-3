/**
 * Runtime allowlist of providers/models the Admin Panel may select.
 * Model IDs live here (single source of truth) ,  never hard-coded in routes/UI.
 */

export interface AllowlistedModel {
  modelId: string;
  label: string;
  capabilities: { text: boolean; structuredOutput: boolean; vision: boolean; streaming: boolean };
}

export interface AllowlistedProvider {
  id: string;
  displayName: string;
  models: AllowlistedModel[];
}

const TEXT_CAPS = { text: true, structuredOutput: true, vision: false, streaming: true };
const VISION_CAPS = { text: true, structuredOutput: true, vision: true, streaming: true };

export const ALLOWLISTED_PROVIDERS: AllowlistedProvider[] = [
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    models: [
      { modelId: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (OpenRouter)', capabilities: VISION_CAPS },
      { modelId: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (OpenRouter)', capabilities: VISION_CAPS },
      { modelId: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', capabilities: VISION_CAPS },
      { modelId: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenRouter)', capabilities: VISION_CAPS },
    ],
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic (direct)',
    models: [
      { modelId: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', capabilities: VISION_CAPS },
      { modelId: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', capabilities: TEXT_CAPS },
    ],
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini (direct)',
    models: [
      { modelId: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', capabilities: VISION_CAPS },
      { modelId: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', capabilities: VISION_CAPS },
    ],
  },
  {
    id: 'compatible',
    displayName: 'OpenAI-compatible endpoint',
    models: [
      { modelId: 'custom', label: 'Custom (verified endpoint only)', capabilities: TEXT_CAPS },
    ],
  },
  {
    id: 'mock',
    displayName: 'Mock (tests only)',
    models: [{ modelId: 'mock-tutor', label: 'Mock tutor', capabilities: TEXT_CAPS }],
  },
];

export function isAllowlisted(providerId: string, modelId: string): boolean {
  const provider = ALLOWLISTED_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return false;
  // OpenRouter + compatible allow admin-typed models only if they match a known
  // prefix pattern; direct vendors must match exactly.
  if (providerId === 'openrouter') {
    if (provider.models.some((m) => m.modelId === modelId)) return true;
    // Allow other OpenRouter slug models (org/model) ,  still routed via OpenRouter.
    return /^[a-z0-9_-]+\/[a-z0-9._-]+$/i.test(modelId);
  }
  if (providerId === 'compatible') return modelId.length > 0 && modelId.length < 200;
  return provider.models.some((m) => m.modelId === modelId);
}

export function capabilitiesFor(providerId: string, modelId: string) {
  const provider = ALLOWLISTED_PROVIDERS.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.modelId === modelId);
  return model?.capabilities ?? { text: true, structuredOutput: false, vision: false, streaming: true };
}
