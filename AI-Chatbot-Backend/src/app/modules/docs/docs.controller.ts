import { Request, Response } from 'express';
import { asyncHandler, ok, fail } from '../../../utils/response.utils';
import docsContentService from '../../../services/docs/docsContent.service';
import docsStatsService from '../../../services/docs/docsStats.service';
import { streamFile } from '../../../config/gridfs';

/**
 * Public docs controller. Enforces server-side visibility gating:
 * - disabled docs -> 403 (no content exposed)
 * - unpublished docs -> 404
 * - stats are aggregate-only (no PII)
 */
export const docsController = {
  meta: asyncHandler(async (_req: Request, res: Response) => {
    const meta = await docsContentService.getPublicMeta();
    return ok(res, meta);
  }),

  content: asyncHandler(async (_req: Request, res: Response) => {
    const content = await docsContentService.getPublicSnapshot();
    return ok(res, { content });
  }),

  stats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await docsStatsService.getStats();
    return ok(res, { stats });
  }),

  /** Streams a public team-member avatar from GridFS. */
  media: asyncHandler(async (req: Request, res: Response) => {
    const memberId = String(req.params.memberId ?? '');
    if (!memberId) return fail(res, 400, 'Member id is required');
    const content = await docsContentService.getPublicSnapshot();
    const member = (content.teamMembers ?? []).find((candidate) => candidate.id === memberId);
    if (!member?.avatarId) return fail(res, 404, 'Avatar not found');
    if (!res.headersSent) res.setHeader('Cache-Control', 'public, max-age=300');
    await streamFile(res, member.avatarId);
  }),
};

export default docsController;
