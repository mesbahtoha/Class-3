import { z } from 'zod';

export const startAttemptSchema = z.object({
  bookId: z.string().min(1).max(64),
  questionType: z.enum(['mcq', 'fill_blank', 'true_false', 'matching', 'one_word', 'rearrange', 'translation']),
  mode: z.enum(['practice', 'exam']),
  chapters: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const checkAnswerSchema = z.object({
  questionId: z.string().min(1).max(64),
  value: z.unknown(),
});

export const attemptAnswersSchema = z.array(
  z.object({
    questionId: z.string().min(1).max(64),
    value: z.unknown(),
  })
);
