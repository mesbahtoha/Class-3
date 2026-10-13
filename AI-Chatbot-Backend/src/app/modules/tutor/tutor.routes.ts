import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler, ok } from '../../../utils/response.utils';
import { validate } from '../../../middleware/validate.middleware';
import { authenticate } from '../../../middleware/auth.middleware';
import { aiLimiter } from '../../../middleware/rateLimiter.middleware';
import tutorService from '../../../services/ai/tutor.service';
import quotaService from '../../../services/quota.service';
import { estimateTokens } from '../../../utils/text.utils';
import { FeedbackModel } from '../../../database/models/ChatLog.model';
import { log } from '../../../config/logger';
import env from '../../../config/env';

const router = Router();

/** Guest: rate-limited temporary text chat only (no history, no media). */
export const guestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Math.max(1, env.tutor.guestPerMin || 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Guest limit reached. Please wait a minute or log in.' },
});

/** Light limiter for stateless tutor feedback (guests included). */
export const tutorFeedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many feedback requests. Please slow down.' },
});

const guestChatSchema = z.object({
  message: z.string().min(1).max(2000),
  language: z.enum(['bn', 'en', 'auto']).optional(),
  subject: z.string().max(100).optional(),
  bookId: z.string().max(50).optional(),
});

const tutorFeedbackSchema = z.object({
  requestId: z.string().min(1).max(100),
  helpful: z.boolean(),
  comment: z.string().trim().max(500).optional(),
});

router.post(
  '/guest-chat',
  guestLimiter,
  validate(guestChatSchema),
  asyncHandler(async (req, res) => {
    const result = await tutorService.answer(
      {
        message: req.body.message,
        language: req.body.language,
        subject: req.body.subject,
        bookId: req.body.bookId,
      },
      []
    );
    ok(res, { tutor: result });
  })
);

/** Authenticated non-streaming tutor chat (client-independent contract for future mobile). */
router.post(
  '/chat',
  authenticate,
  aiLimiter,
  validate(guestChatSchema),
  asyncHandler(async (req, res) => {
    const input = {
      message: req.body.message,
      language: req.body.language,
      subject: req.body.subject,
      bookId: req.body.bookId,
    };
    // Authenticated tutor answers count against the per-user token quota
    // (guests are covered by the guest rate limiter instead).
    await quotaService.assertCanUseAI(req.user!.id, tutorService.estimatePromptTokens(input), req.user!.role);
    const result = await tutorService.answer(input, []);
    try {
      await quotaService.recordUsage({
        userId: new Types.ObjectId(req.user!.id),
        conversationId: null,
        messageId: null,
        model: result.model || 'tutor',
        promptTokens: tutorService.estimatePromptTokens(input),
        completionTokens: estimateTokens(result.answer),
        requestType: 'chat',
      });
    } catch (error) {
      log.warn('Tutor usage record failed', { message: (error as Error).message });
    }
    ok(res, { tutor: result });
  })
);

/**
 * Grounded practice question for a topic. Returns 404 with a child-friendly
 * message when no book context exists (never invents a quiz).
 */
router.post(
  '/quiz',
  authenticate,
  aiLimiter,
  validate(guestChatSchema),
  asyncHandler(async (req, res) => {
    const input = {
      message: req.body.message,
      language: req.body.language,
      subject: req.body.subject,
      bookId: req.body.bookId,
    };
    await quotaService.assertCanUseAI(req.user!.id, tutorService.estimatePromptTokens(input), req.user!.role);
    const made = await tutorService.makeQuiz(input);
    if (!made) {
      return res.status(404).json({
        success: false,
        message: 'No practice question for this yet. Try a topic from your books.',
      });
    }
    try {
      await quotaService.recordUsage({
        userId: new Types.ObjectId(req.user!.id),
        conversationId: null,
        messageId: null,
        model: 'tutor-quiz',
        promptTokens: tutorService.estimatePromptTokens(input),
        completionTokens: estimateTokens(made.quiz.question),
        requestType: 'chat',
      });
    } catch (error) {
      log.warn('Tutor quiz usage record failed', { message: (error as Error).message });
    }
    ok(res, { quiz: made.quiz, sources: made.sources });
  })
);

/**
 * Stateless tutor feedback (works for guests: no login, no conversation).
 * Best-effort storage ,  a logging failure never punishes the child.
 */
router.post(
  '/feedback',
  tutorFeedbackLimiter,
  validate(tutorFeedbackSchema),
  asyncHandler(async (req, res) => {
    const { requestId, helpful, comment } = req.body as z.infer<typeof tutorFeedbackSchema>;
    try {
      await FeedbackModel.create({
        type: helpful ? 'tutor-helpful' : 'tutor-not-helpful',
        comment: `${requestId} :: ${comment || ''}`.slice(0, 500),
      });
    } catch (error) {
      log.warn('Tutor feedback store failed', { message: (error as Error).message });
    }
    ok(res, { message: 'Thanks for your feedback!' });
  })
);

export default router;
