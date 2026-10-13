import crypto from 'crypto';
import { z } from 'zod';
import { generateWithFallback } from './provider-router';
import { buildTutorMessages, buildFollowUpQuestion } from './prompt-builder.service';
import { QuizPreviewSchema, sanitizeAnswerText, TutorResponse, TutorSource, validateSources } from './response-validator.service';
import { decideAnswerLanguage, detectScript, retrievalQueryForms } from './banglish-normalizer.service';
import { parseTextbookRef, resolveKnownExercise } from './exercise-resolver.service';
import { retrieveBookChunks, retrievalSufficient, BookFilter, RetrievedBookChunk } from '../rag/retrieval.service';
import { estimateTokens } from '../../utils/text.utils';
import { log } from '../../config/logger';

export const TutorChatSchema = z.object({
  message: z.string().min(1).max(4000),
  language: z.enum(['bn', 'en', 'auto']).optional(),
  bookId: z.string().optional(),
  subject: z.string().optional(),
  grade: z.string().optional(),
  curriculum: z.string().optional(),
});

export type TutorChatInput = z.infer<typeof TutorChatSchema>;

export interface TutorHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Textbook-grounded Class 3 tutor. Flow:
 * original question (preserved) -> language detect -> retrieval over
 * published books (original + variants) -> tutor prompt -> provider router
 * (primary + allowlisted fallbacks) -> sanitize + citation validation ->
 * stable TutorResponse. Low/empty retrieval -> honest INSUFFICIENT_BOOK_CONTEXT.
 */
export const tutorService = {
  async answer(input: TutorChatInput, history: TutorHistoryItem[] = []): Promise<TutorResponse> {
    const requestId = crypto.randomUUID();
    const question = String(input.message || '').trim();
    if (!question) throw Object.assign(new Error('Message is required'), { statusCode: 400 });

    const detected = detectScript(question);
    void retrievalQueryForms(question);
    const preference = input.language === 'auto' || !input.language ? undefined : input.language;
    const answerLanguage = decideAnswerLanguage(detected, preference);

    // Deterministic fix for short textbook references like
    // "Unit 3, lesson 5, number C, Match the request, page 45".
    // Retrieval has almost no keywords here, so solve from the known key.
    const known = resolveKnownExercise(question);
    if (known) {
      const picked = answerLanguage === 'bn' ? known.answerBn : known.answerEn;
      return {
        answer: picked,
        answerLanguage: answerLanguage === 'bn' ? 'bn' : 'en',
        answerStatus: 'ANSWERED',
        sources: [],
        followUpQuestion: buildFollowUpQuestion(answerLanguage),
        requestId,
        provider: 'exercise-key',
        model: known.key,
      };
    }

    const filter: BookFilter = {};
    if (input.bookId) filter.bookId = input.bookId;
    if (input.subject) filter.subject = input.subject;
    if (input.grade) filter.grade = input.grade;
    if (input.curriculum) filter.curriculum = input.curriculum;

    const chunks: RetrievedBookChunk[] = await retrieveBookChunks(question, filter, 6);
    const sufficient = retrievalSufficient(chunks);

    const messages = buildTutorMessages({
      question,
      answerLanguage,
      chunks,
      history,
      bookFilterLabel: input.subject ? `Subject: ${input.subject}` : undefined,
    });

    let rawText = '';
    let provider = 'openrouter';
    let model = '';
    try {
      const result = await generateWithFallback(messages as never, { temperature: 0.3, maxTokens: 700 });
      rawText = result.text;
      provider = result.provider;
      model = result.model;
    } catch (error) {
      // Provider outage/rate-limit: honest error in the child's language, no fake success.
      const friendly =
        answerLanguage === 'bn'
          ? 'উফ! এখন উত্তর দিতে সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করো।'
          : 'Oops! I am having trouble answering right now. Please try again in a moment.';
      return {
        answer: friendly,
        answerLanguage: answerLanguage === 'bn' ? 'bn' : 'en',
        answerStatus: 'CLARIFICATION_NEEDED',
        sources: [],
        followUpQuestion: undefined,
        requestId,
        provider,
        model,
      };
    }

    const answer = sanitizeAnswerText(rawText);
    if (!answer) {
      return {
        answer: answerLanguage === 'bn' ? 'আমি এখন উত্তর তৈরি করতে পারিনি। আবার চেষ্টা করো।' : 'I could not make an answer right now. Please try again.',
        answerLanguage: answerLanguage === 'bn' ? 'bn' : 'en',
        answerStatus: 'CLARIFICATION_NEEDED',
        sources: [],
        requestId,
        provider,
        model,
      };
    }

    // Citations derived ONLY from stored retrieval metadata ,  never invented.
    const chunkIds = new Set(chunks.map((c) => c.chunkId));
    const candidateSources: TutorSource[] = chunks.slice(0, 4).map((c) => ({
      bookId: c.bookId,
      bookTitle: c.bookTitle,
      chapterTitle: c.chapterTitle,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      chunkId: c.chunkId,
    }));
    const { valid: sources } = validateSources(candidateSources, chunkIds);

    if (!sufficient) {
      // Honest insufficient-context: keep the general explanation but mark it.
      const prefix =
        answerLanguage === 'bn'
          ? 'আমার বইয়ে এই বিষয়টা খুঁজে পাইনি, তবে সাধারণভাবে বুঝিয়ে দিচ্ছি:\n\n'
          : 'I could not find this in the books, but here is some general help:\n\n';
      return {
        answer: `${prefix}${answer}`,
        answerLanguage: answerLanguage === 'bn' ? 'bn' : 'en',
        answerStatus: 'INSUFFICIENT_BOOK_CONTEXT',
        sources: [],
        followUpQuestion: buildFollowUpQuestion(answerLanguage),
        requestId,
        provider,
        model,
      };
    }

    return {
      answer,
      answerLanguage: answerLanguage === 'bn' ? 'bn' : 'en',
      answerStatus: 'ANSWERED',
      sources,
      followUpQuestion: buildFollowUpQuestion(answerLanguage),
      requestId,
      provider,
      model,
    };
  },

  /**
   * Generates ONE grounded practice question for a topic. Retrieval-first:
   * options/answer must come from published book chunks; any failure
   * (no context, bad JSON, schema mismatch) returns null so the client
   * shows an honest "try again" instead of a fake quiz.
   */
  async makeQuiz(input: TutorChatInput): Promise<{ quiz: z.infer<typeof QuizPreviewSchema>; sources: TutorSource[] } | null> {
    const topic = String(input.message || '').trim();
    if (!topic) return null;
    const detected = detectScript(topic);
    const preference = input.language === 'auto' || !input.language ? undefined : input.language;
    const answerLanguage = decideAnswerLanguage(detected, preference);

    const filter: BookFilter = {};
    if (input.bookId) filter.bookId = input.bookId;
    if (input.subject) filter.subject = input.subject;
    if (input.grade) filter.grade = input.grade;
    if (input.curriculum) filter.curriculum = input.curriculum;

    const chunks = await retrieveBookChunks(topic, filter, 4);
    if (!retrievalSufficient(chunks)) return null;

    const context = chunks
      .map((c, i) => `Passage ${i + 1} (${c.bookTitle}):\n${c.text.slice(0, 800)}`)
      .join('\n\nNEXT PASSAGE\n\n');
    const langRule =
      answerLanguage === 'bn'
        ? 'Write the question and all options in Bengali script (বাংলা হরফে), simple Class 3 words.'
        : 'Write the question and all options in simple English for a Class 3 child.';
    let raw = '';
    try {
      const result = await generateWithFallback(
        [
          {
            role: 'system',
            content: `You make ONE tiny practice question for a Class 3 child in Bangladesh. ${langRule} Base it ONLY on the passages below. 3 short options, exactly one correct. Reply with JSON ONLY, no other text: {"question":"...","options":["...","...","..."],"answerIndex":0}`,
          },
          { role: 'user', content: `Topic: ${topic}\n\nPassages:\n${context}` },
        ] as never,
        { temperature: 0.4, maxTokens: 300 }
      );
      raw = result.text;
    } catch (error) {
      log.warn('Tutor quiz generation failed', { message: (error as Error).message });
      return null;
    }
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }
    const quiz = QuizPreviewSchema.safeParse(parsed);
    if (!quiz.success) return null;

    const chunkIds = new Set(chunks.map((c) => c.chunkId));
    const candidateSources: TutorSource[] = chunks.slice(0, 2).map((c) => ({
      bookId: c.bookId,
      bookTitle: c.bookTitle,
      chapterTitle: c.chapterTitle,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      chunkId: c.chunkId,
    }));
    const { valid: sources } = validateSources(candidateSources, chunkIds);
    return { quiz: quiz.data, sources };
  },

  /** Token estimate for quota checks (question + expected answer). */
  estimatePromptTokens(input: TutorChatInput): number {
    return estimateTokens(String(input.message || '')) + 120;
  },
};

export default tutorService;
