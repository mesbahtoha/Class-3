import { z } from 'zod';

export const startAttemptSchema = z.object({
  setId: z.string().min(1).max(64),
  mode: z.enum(['practice', 'exam']),
  chapters: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const attemptAnswersSchema = z.array(
  z.object({
    questionId: z.string().min(1).max(64),
    value: z.unknown(),
  })
);
