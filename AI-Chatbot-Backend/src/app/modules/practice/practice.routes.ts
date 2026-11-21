import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { asyncHandler, ok } from '../../../utils/response.utils';
import practiceController from './practice.controller';
import { validate } from '../../../middleware/validate.middleware';
import { startAttemptSchema, attemptAnswersSchema, checkAnswerSchema } from './practice.validation';

const router = Router();

router.get('/books', asyncHandler(async (_req, res) => {
  const books = await practiceController.listBooks();
  return ok(res, { books });
}));

router.get(
  '/books/:bookId/chapters',
  asyncHandler(async (req, res) => {
    const chapters = await practiceController.listChapters(String(req.params.bookId));
    return ok(res, { chapters });
  })
);

router.get(
  '/sets',
  asyncHandler(async (req, res) => {
    const { bookId, questionType, mode, chapterIds } = req.query as Record<string, string>;
    const filters: Record<string, unknown> = {};
    if (bookId) filters.bookId = bookId;
    if (questionType) filters.questionType = questionType;
    if (mode) filters.mode = mode;
    if (chapterIds) filters.chapterIds = String(chapterIds).split(',').filter(Boolean);
    const result = await practiceController.listSets(filters);
    return ok(res, result);
  })
);

router.get(
  '/sets/:id',
  asyncHandler(async (req, res) => {
    const set = await practiceController.getSet(String(req.params.id));
    return ok(res, { set });
  })
);

router.post(
  '/attempts',
  authenticate,
  validate(startAttemptSchema, 'body'),
  asyncHandler(async (req, res) => {
    const attempt = await practiceController.startAttempt(req.user!.id, req.body);
    return ok(res, { attempt }, 201);
  })
);

router.get(
  '/attempts',
  authenticate,
  asyncHandler(async (req, res) => {
    const limitParam = req.query.limit ? Number(req.query.limit) : undefined;
    const rawMode = String(req.query.mode ?? '');
    const modeParam = (rawMode === 'practice' || rawMode === 'exam' ? rawMode : undefined);
    const attempts = await practiceController.listAttempts(req.user!.id, { limit: limitParam, mode: modeParam });
    return ok(res, { attempts });
  })
);

router.get(
  '/attempts/:attemptId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { attempt, evaluation, duplicate, autoSubmitted } = await practiceController.getAttempt(req.user!.id, String(req.params.attemptId));
    return ok(res, { attempt, evaluation, duplicate, autoSubmitted });
  })
);

router.post(
  '/attempts/:attemptId/answers',
  authenticate,
  validate(attemptAnswersSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { attempt, autoSubmitted } = await practiceController.saveAnswers(req.user!.id, String(req.params.attemptId), req.body);
    return ok(res, { attempt, autoSubmitted });
  })
);

router.post(
  '/attempts/:attemptId/check',
  authenticate,
  validate(checkAnswerSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { questionId, value } = req.body as { questionId: string; value: unknown };
    const { result } = await practiceController.checkAnswer(req.user!.id, String(req.params.attemptId), questionId, value);
    return ok(res, { result });
  })
);

router.post(
  '/attempts/:attemptId/submit',
  authenticate,
  validate(attemptAnswersSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { attempt, evaluation, duplicate, autoSubmitted } = await practiceController.submitAttempt(req.user!.id, String(req.params.attemptId), req.body);
    return ok(res, { attempt, evaluation, duplicate, autoSubmitted });
  })
);

export default router;
