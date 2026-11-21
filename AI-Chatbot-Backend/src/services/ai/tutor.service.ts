import crypto from 'crypto';
import { z } from 'zod';
import pdfParse from 'pdf-parse';
import { generateWithFallback } from './provider-router';
import { buildTutorMessages, buildFollowUpQuestion } from './prompt-builder.service';
import { QuizPreviewSchema, sanitizeAnswerText, TutorResponse, TutorSource, validateSources } from './response-validator.service';
import { decideAnswerLanguage, detectScript, retrievalQueryForms } from './banglish-normalizer.service';
import { parseTextbookRef, resolveKnownExercise } from './exercise-resolver.service';
import { retrieveBookChunks, retrievalSufficient, BookFilter, RetrievedBookChunk } from '../rag/retrieval.service';
import { readChatAttachments, deleteChatAttachments } from '../attachment.service';
import { capabilitiesFor } from './capabilities';
import { settingsService } from '../settings.service';
import { estimateTokens, normalizeText } from '../../utils/text.utils';
import { log } from '../../config/logger';

export const attachmentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['image', 'pdf']),
  name: z.string().max(200).optional(),
});

export const TutorChatSchema = z.object({
  message: z.string().min(1).max(4000),
  language: z.enum(['bn', 'en', 'auto']).optional(),
  mode: z.enum(['fast', 'balanced', 'accurate']).optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
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
  /**
   * Textbook-grounded answer. Attachments (authenticated users only) are
   * single-use: they are read for this request and removed in `finally`.
   */
  async answer(
    input: TutorChatInput,
    history: TutorHistoryItem[] = [],
    options: { userId?: string } = {}
  ): Promise<TutorResponse> {
    const attachmentIds: string[] = [];
    try {
      return await tutorService.buildAnswer(input, history, options, attachmentIds);
    } finally {
      if (options.userId && attachmentIds.length) {
        deleteChatAttachments(attachmentIds, options.userId);
      }
    }
  },

  async buildAnswer(
    input: TutorChatInput,
    history: TutorHistoryItem[] = [],
    options: { userId?: string } = {},
    attachmentIds: string[] = []
  ): Promise<TutorResponse> {
    const requestId = crypto.randomUUID();
    const question = String(input.message || '').trim();
    if (!question) throw Object.assign(new Error('Message is required'), { statusCode: 400 });

    const detected = detectScript(question);
    void retrievalQueryForms(question);
    const preference = input.language === 'auto' || !input.language ? undefined : input.language;
    const answerLanguage = decideAnswerLanguage(detected, preference);

    // ---- Optional attachments + answer mode (authenticated users only) ----
    const requestedAttachments = input.attachments ?? [];
    const attachmentBlocks: string[] = [];
    const imageParts: Array<Record<string, unknown>> = [];
    let modelOverride: string | undefined;

    if (input.mode || requestedAttachments.length) {
      const aiSettings = await settingsService.getAISettings();
      modelOverride =
        input.mode === 'fast'
          ? aiSettings.modelFast
          : input.mode === 'accurate'
            ? aiSettings.modelAccurate
            : aiSettings.model;

      if (requestedAttachments.length) {
        if (!options.userId) {
          throw Object.assign(new Error('Please log in to attach photos or documents.'), { statusCode: 401 });
        }

        // Fail fast with a child-friendly message when the active model cannot
        // read images, before burning quota or hitting a raw provider error.
        const hasImage = requestedAttachments.some((item) => item.type === 'image');
        if (hasImage && !capabilitiesFor(aiSettings.provider, modelOverride || aiSettings.model).vision) {
          throw Object.assign(
            new Error(
              'This AI model cannot read photos right now. Please describe the picture in words, or ask the admin to switch to a vision-capable model.'
            ),
            { statusCode: 422 }
          );
        }

        const stored = readChatAttachments(
          requestedAttachments.map((item) => item.id),
          options.userId
        );

        for (const attachment of requestedAttachments) {
          const item = stored.find((candidate) => candidate.id === attachment.id);
          if (!item) {
            throw Object.assign(
              new Error('This attachment is no longer available. Please attach it again before sending.'),
              { statusCode: 400 }
            );
          }
          attachmentIds.push(item.id);

          if (item.type === 'image') {
            imageParts.push({
              type: 'image_url',
              image_url: { url: `data:${item.mimeType};base64,${item.buffer.toString('base64')}` },
            });
          } else {
            let extracted = '';
            try {
              const parsed = await pdfParse(item.buffer);
              extracted = normalizeText(parsed.text || '');
            } catch (error) {
              log.warn('Tutor PDF parse failed', { message: (error as Error).message });
            }
            if (!extracted) {
              throw Object.assign(
                new Error(
                  "I couldn't read this file. Please try uploading a clearer image or a valid PDF (scanned PDFs without selectable text may not be supported)."
                ),
                { statusCode: 422 }
              );
            }
            attachmentBlocks.push(`Attached document "${item.name}":\n${extracted}`);
          }
        }
      }
    }

    // Deterministic fix for short textbook references like
    // "Unit 3, lesson 5, number C, Match the request, page 45".
    // Retrieval has almost no keywords here, so solve from the known key.
    // When a file is attached, the file is the source of truth instead.
    const known = resolveKnownExercise(question);
    if (known && !requestedAttachments.length) {
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

    // Retrieval also considers text extracted from an attached PDF so the
    // answer can be grounded when the learner attaches a worksheet.
    const retrievalQuery = [question, ...attachmentBlocks].join('\n\n');
    const chunks: RetrievedBookChunk[] = await retrieveBookChunks(retrievalQuery, filter, 6);
    const sufficient = retrievalSufficient(chunks);

    const messages = buildTutorMessages({
      question,
      answerLanguage,
      // Weak matches are not shown to the model, so a labelled general answer
      // cannot accidentally claim "the book says" from a low-confidence chunk.
      chunks: sufficient ? chunks : [],
      history,
      bookFilterLabel: input.subject ? `Subject: ${input.subject}` : undefined,
      attachmentsText: attachmentBlocks.join('\n\n') || undefined,
      hasImage: imageParts.length > 0,
    });

    // Images travel as multimodal content parts on the final user message.
    if (imageParts.length) {
      const last = messages[messages.length - 1];
      const text = typeof last.content === 'string' ? last.content : '';
      messages[messages.length - 1] = {
        role: 'user',
        content: [{ type: 'text', text }, ...imageParts],
      };
    }

    let rawText = '';
    let provider = 'openrouter';
    let model = '';
    try {
      const result = await generateWithFallback(messages as never, {
        temperature: 0.3,
        maxTokens: 700,
        ...(modelOverride ? { model: modelOverride } : {}),
      });
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

    if (!sufficient && !requestedAttachments.length) {
      // Honest insufficient-context: keep the general explanation but mark it.
      // (With an attached file the answer is grounded in the file instead.)
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

  /** Token estimate for quota checks (question + attachments + expected answer). */
  estimatePromptTokens(input: TutorChatInput): number {
    const attachmentEstimate = (input.attachments?.length ?? 0) * 400;
    return estimateTokens(String(input.message || '')) + attachmentEstimate + 120;
  },
};

export default tutorService;
