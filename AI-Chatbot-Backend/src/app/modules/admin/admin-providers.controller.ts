import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { asyncHandler, ok, fail } from '../../../utils/response.utils';
import { settingsService } from '../../../services/settings.service';
import { ALLOWLISTED_PROVIDERS, isAllowlisted } from '../../../services/ai/capabilities';
import providerRegistry from '../../../services/ai/provider-registry';
import { maskSecret } from '../../../utils/token.utils';

export const updateProvidersSchema = z.object({
  provider: z.string().min(1).max(50),
  model: z.string().min(1).max(200),
  fallbacks: z.array(z.object({ providerId: z.string().min(1), model: z.string().min(1) })).max(3).optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(64).max(4000).optional(),
  timeoutMs: z.number().int().min(5000).max(120000).optional(),
  // Secrets are write-only: accepted here, never returned.
  anthropicApiKey: z.string().max(200).optional(),
  geminiApiKey: z.string().max(200).optional(),
  openRouterApiKey: z.string().max(300).optional(),
  compatibleBaseUrl: z.string().max(300).optional(),
  compatibleApiKey: z.string().max(300).optional(),
  compatibleModel: z.string().max(200).optional(),
});

function secretStatus(value: string): { configured: boolean; masked: string | null } {
  return { configured: Boolean(value), masked: value ? maskSecret(value) : null };
}

/**
 * Admin provider/model management. Secrets are write-only and masked on read.
 * NOTE: MVP stores admin-provided keys in settings documents; deployments
 * should prefer env secrets. Keys are never returned or logged.
 */
export const adminProvidersController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const values = await settingsService.loadValues([
      'ai.provider',
      'ai.model',
      'ai.fallbacks',
      'ai.temperature',
      'ai.maxTokens',
      'ai.timeoutMs',
      'ai.openRouterApiKey',
      'ai.anthropicApiKey',
      'ai.geminiApiKey',
      'ai.compatibleBaseUrl',
      'ai.compatibleApiKey',
      'ai.compatibleModel',
    ]);
    const openRouter = secretStatus(String(values['ai.openRouterApiKey'] ?? process.env.OPENROUTER_API_KEY ?? ''));
    const anthropic = secretStatus(String(values['ai.anthropicApiKey'] ?? process.env.ANTHROPIC_API_KEY ?? ''));
    const gemini = secretStatus(String(values['ai.geminiApiKey'] ?? process.env.GEMINI_API_KEY ?? ''));
    const compatible = secretStatus(String(values['ai.compatibleApiKey'] ?? ''));
    ok(res, {
      active: {
        provider: String(values['ai.provider'] ?? 'openrouter'),
        model: String(values['ai.model'] ?? ''),
        fallbacks: values['ai.fallbacks'] ?? [],
        temperature: Number(values['ai.temperature'] ?? 0.3),
        maxTokens: Number(values['ai.maxTokens'] ?? 700),
        timeoutMs: Number(values['ai.timeoutMs'] ?? 45000),
      },
      providers: ALLOWLISTED_PROVIDERS.map((p) => {
        const adapter = providerRegistry.get(p.id);
        return {
          id: p.id,
          displayName: p.displayName,
          models: p.models,
          implemented: Boolean(adapter),
          capabilities: adapter?.capabilities ?? null,
        };
      }),
      credentials: {
        openrouter: { ...openRouter, source: process.env.OPENROUTER_API_KEY ? 'env' : openRouter.configured ? 'settings' : 'none' },
        anthropic: { ...anthropic, source: process.env.ANTHROPIC_API_KEY ? 'env' : anthropic.configured ? 'settings' : 'none' },
        gemini: { ...gemini, source: process.env.GEMINI_API_KEY ? 'env' : gemini.configured ? 'settings' : 'none' },
        compatible: { ...compatible, endpoint: String(values['ai.compatibleBaseUrl'] ?? '') || null },
      },
    });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!providerRegistry.get(body.provider)) return fail(res, 400, `Provider "${body.provider}" is not implemented`);
    if (!isAllowlisted(body.provider, body.model)) return fail(res, 400, `Model "${body.model}" is not allowlisted for provider "${body.provider}"`);
    if (body.fallbacks) {
      for (const f of body.fallbacks) {
        if (!providerRegistry.get(f.providerId)) return fail(res, 400, `Fallback provider "${f.providerId}" is not implemented`);
        if (!isAllowlisted(f.providerId, f.model)) return fail(res, 400, `Fallback model "${f.model}" is not allowlisted`);
      }
    }
    const entries: Array<{ key: string; value: unknown }> = [
      { key: 'ai.provider', value: body.provider },
      { key: 'ai.model', value: body.model },
    ];
    if (body.fallbacks !== undefined) entries.push({ key: 'ai.fallbacks', value: body.fallbacks });
    if (body.temperature !== undefined) entries.push({ key: 'ai.temperature', value: body.temperature });
    if (body.maxTokens !== undefined) entries.push({ key: 'ai.maxTokens', value: body.maxTokens });
    if (body.timeoutMs !== undefined) entries.push({ key: 'ai.timeoutMs', value: body.timeoutMs });
    // Write-only secrets: empty string removes the stored key.
    for (const k of ['openRouterApiKey', 'anthropicApiKey', 'geminiApiKey', 'compatibleBaseUrl', 'compatibleApiKey', 'compatibleModel'] as const) {
      if (body[k] !== undefined) entries.push({ key: `ai.${k}`, value: body[k] });
    }
    await settingsService.updateMany(entries);
    ok(res, { message: 'Provider settings updated', requestId: req.requestId || crypto.randomUUID() });
  }),

  validate: asyncHandler(async (req: Request, res: Response) => {
    const providerId = String(req.params.providerId || req.body?.providerId || '');
    const adapter = providerRegistry.get(providerId);
    if (!adapter || !adapter.validateConnection) return fail(res, 400, `Provider "${providerId}" cannot be validated`);
    const result = await adapter.validateConnection(20000);
    // Never expose key contents ,  only ok/latency/model.
    ok(res, { provider: providerId, ok: result.ok, latencyMs: result.latencyMs, model: result.model ?? null });
  }),
};

export default adminProvidersController;
