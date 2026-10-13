import { z } from 'zod';

/** Stable application response contract ,  identical for every provider. */
export const TutorSourceSchema = z.object({
  bookId: z.string(),
  bookTitle: z.string(),
  chapterId: z.string().optional(),
  chapterTitle: z.string().optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  chunkId: z.string(),
});

export const SlideSchema = z.object({
  type: z.enum(['TITLE', 'EXPLANATION', 'IMAGE', 'DIAGRAM', 'EXAMPLE', 'INTERACTIVE', 'QUIZ', 'SUMMARY']),
  title: z.string().max(200),
  body: z.string().max(2000),
  imageUrl: z.string().url().optional(),
  // Only allow-listed diagram kinds rendered by trusted components.
  diagramKind: z.enum(['fraction-bar', 'number-line', 'shapes', 'tally', 'none']).optional(),
  quizOptions: z.array(z.string().max(200)).max(4).optional(),
  quizAnswerIndex: z.number().int().min(0).max(3).optional(),
});

export const LessonPlanSchema = z.object({
  lessonId: z.string(),
  title: z.string().max(200),
  subject: z.string().max(100).optional(),
  slides: z.array(SlideSchema).min(1).max(12),
});

export const QuizPreviewSchema = z.object({
  question: z.string().max(500),
  options: z.array(z.string().max(200)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
});

export const TutorResponseSchema = z.object({
  answer: z.string().min(1).max(8000),
  answerLanguage: z.enum(['bn', 'en', 'banglish']),
  answerStatus: z.enum(['ANSWERED', 'INSUFFICIENT_BOOK_CONTEXT', 'CLARIFICATION_NEEDED']),
  sources: z.array(TutorSourceSchema).max(6),
  lesson: LessonPlanSchema.optional(),
  quiz: QuizPreviewSchema.optional(),
  followUpQuestion: z.string().max(500).optional(),
  requestId: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export type TutorSource = z.infer<typeof TutorSourceSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
export type TutorSlide = z.infer<typeof SlideSchema>;
export type TutorResponse = z.infer<typeof TutorResponseSchema>;

/** Strips any model-generated HTML/JS/SVG ,  frontend renders Markdown only. */
export function sanitizeAnswerText(text: string): string {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, 8000);
}

/** Validates that every source maps to a real retrieved chunk of a published book. */
export function validateSources(
  sources: TutorSource[],
  retrievedChunkIds: Set<string>
): { valid: TutorSource[]; dropped: number } {
  const valid: TutorSource[] = [];
  let dropped = 0;
  for (const s of sources) {
    const parsed = TutorSourceSchema.safeParse(s);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    if (!retrievedChunkIds.has(s.chunkId)) {
      dropped += 1;
      continue;
    }
    valid.push(parsed.data);
  }
  return { valid, dropped };
}

/** Validates lesson JSON ,  unknown slide types fail safely (dropped). */
export function validateLessonPlan(raw: unknown): LessonPlan | undefined {
  if (!raw) return undefined;
  const parsed = LessonPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
