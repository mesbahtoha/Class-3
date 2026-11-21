import mongoose from 'mongoose';
import { z } from 'zod';
import { BookModel } from '../../database/models/Book.model';
import { PracticeQuestionModel } from '../../database/models/PracticeQuestion.model';
import { PracticeQuestionSetModel } from '../../database/models/PracticeQuestionSet.model';
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_PUBLICATION_STATES,
  PRACTICE_QUESTION_TYPES,
} from '../../constants';
import { listChaptersForBook } from './chapters.service';
import { startPracticeAttempt } from './practice.service';
import { PracticeError } from './types';

/* ------------------------------------------------------------------ */
/* Question input schema (admin authoring)                           */
/* ------------------------------------------------------------------ */

const chapterIdField = z.string().max(64).optional();

export const questionInputSchema = z.discriminatedUnion('questionType', [
  z.object({
    questionType: z.literal('mcq'),
    chapterId: chapterIdField,
    question: z.string().min(1).max(2000),
    options: z.array(z.string().min(1).max(300)).min(2).max(6),
    correctIndex: z.number().int().min(0).max(5),
    marks: z.number().min(0).max(100).optional(),
  }),
  z.object({
    questionType: z.literal('fill_blank'),
    chapterId: chapterIdField,
    text: z.string().min(1).max(3000),
    blanks: z
      .array(
        z.object({
          accepted: z.array(z.string().min(1).max(300)).min(1),
          marks: z.number().min(0).max(100).optional(),
        })
      )
      .min(1)
      .max(6),
    marks: z.number().min(0).max(100).optional(),
  }),
  z.object({
    questionType: z.literal('true_false'),
    chapterId: chapterIdField,
    statement: z.string().min(1).max(2000),
    correct: z.boolean(),
    marks: z.number().min(0).max(100).optional(),
  }),
  z.object({
    questionType: z.literal('matching'),
    chapterId: chapterIdField,
    left: z.array(z.string().min(1).max(200)).min(2).max(8),
    right: z.array(z.string().min(1).max(200)).min(2).max(8),
    pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(1).max(8),
    marks: z.number().min(0).max(100).optional(),
  }),
  z.object({
    questionType: z.literal('one_word'),
    chapterId: chapterIdField,
    question: z.string().min(1).max(2000),
    answer: z.string().min(1).max(300),
    alternatives: z.array(z.string().min(1).max(300)).max(8).optional(),
    marks: z.number().min(0).max(100).optional(),
  }),
  z.object({
    questionType: z.literal('rearrange'),
    chapterId: chapterIdField,
    items: z.array(z.string().min(1).max(300)).min(2).max(10),
    marks: z.number().min(0).max(100).optional(),
  }),
  z.object({
    questionType: z.literal('translation'),
    chapterId: chapterIdField,
    source: z.string().min(1).max(1000),
    sourceLanguage: z.string().max(50).optional(),
    targetLanguage: z.string().min(1).max(50),
    answer: z.string().min(1).max(1000),
    alternatives: z.array(z.string().min(1).max(500)).max(8).optional(),
    marks: z.number().min(0).max(100).optional(),
  }),
]);

export type QuestionInput = z.infer<typeof questionInputSchema>;

export const createQuestionSetSchema = z.object({
  title: z.string().min(1).max(200),
  bookId: z.string().min(1),
  chapters: z.array(z.string().min(1)).min(1).max(50),
  questionType: z.enum(PRACTICE_QUESTION_TYPES),
  difficulty: z.enum(PRACTICE_DIFFICULTIES).optional(),
  instructions: z.string().max(2000).optional(),
  marksPerQuestion: z.number().min(0).max(100).optional(),
  practiceModeEnabled: z.boolean().optional(),
  examModeEnabled: z.boolean().optional(),
  examDurationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  negativeMarking: z.number().min(0).max(50).optional(),
  allowUnanswered: z.boolean().optional(),
  publicationState: z.enum(PRACTICE_PUBLICATION_STATES).optional(),
});

export type CreateQuestionSetInput = z.infer<typeof createQuestionSetSchema>;

export const updateQuestionSetSchema = createQuestionSetSchema
  .omit({ publicationState: true })
  .partial();

export type UpdateQuestionSetInput = z.infer<typeof updateQuestionSetSchema>;

export const reorderQuestionsSchema = z.object({
  questionIds: z.array(z.string().min(1).max(64)).min(1).max(200),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
  const random = mulberry32(Array.from(seedText).reduce((sum, ch) => sum + ch.charCodeAt(0), 7));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function textItems(values: string[]): Array<{ id: string; text: string }> {
  return values.map((text, index) => ({ id: `i${index}`, text }));
}

function buildMatchingItems(left: string[], right: string[]) {
  const leftItems = textItems(left);
  const rightOrder = right.map((text, index) => ({ id: `r${index}`, text }));
  const rightShuffled = seededShuffle(rightOrder, right.join('|'));
  return { leftItems, rightShuffled };
}

/**
 * Normalizes the admin-authored input of any of the seven question types into
 * the stored { payload, answer, alternatives, marks } shape.
 */
export function normalizeQuestionInput(
  input: QuestionInput,
  defaultMarks = 0
): {
  questionType: string;
  marks: number;
  payload: Record<string, unknown>;
  answer: Record<string, unknown>;
  alternatives: string[];
} {
  const marks = input.marks ?? defaultMarks;

  switch (input.questionType) {
    case 'mcq':
      return {
        questionType: 'mcq',
        marks,
        payload: { question: input.question, options: input.options },
        answer: { correctIndex: Number(input.correctIndex) },
        alternatives: [],
      };

    case 'fill_blank': {
      const blanks = input.blanks.map((blank) => ({ accepted: blank.accepted, marks: blank.marks ?? marks }));
      const markers = input.text.match(/\{\{(\d+)\}\}/g) ?? [];
      if (markers.length !== blanks.length) {
        throw new PracticeError(400, `Fill-in-the-blank text must contain exactly ${blanks.length} blank marker(s) like {{1}}, {{2}}.`);
      }
      return {
        questionType: 'fill_blank',
        marks,
        payload: { text: input.text },
        answer: { blanks },
        alternatives: [],
      };
    }

    case 'true_false':
      return {
        questionType: 'true_false',
        marks,
        payload: { statement: input.statement },
        answer: { value: input.correct },
        alternatives: [],
      };

    case 'matching': {
      const leftItems = textItems(input.left);
      const rightOrder = input.right.map((text, index) => ({ id: `r${index}`, text }));
      const rightShuffled = seededShuffle(rightOrder, input.right.join('|'));
      const pairs = input.pairs
        .map((pair) => {
          const leftId = leftItems.find((item) => item.text === pair.left)?.id ?? '';
          const rightId = rightShuffled.find((item) => item.text === pair.right)?.id ?? '';
          return { leftId, rightId };
        })
        .filter((pair) => pair.leftId && pair.rightId);

      return {
        questionType: 'matching',
        marks,
        payload: { left: leftItems, right: rightShuffled },
        answer: { pairs },
        alternatives: [],
      };
    }

    case 'one_word': {
      const accepted = Array.from(new Set([input.answer, ...(input.alternatives ?? [])].filter(Boolean) as string[]));
      return {
        questionType: 'one_word',
        marks,
        payload: { question: input.question },
        answer: { accepted },
        alternatives: accepted.slice(1),
      };
    }

    case 'rearrange': {
      const items = input.items.map((text, index) => ({ id: `r${index}`, text }));
      const shuffled = seededShuffle(items, input.items.join('|'));
      return {
        questionType: 'rearrange',
        marks,
        payload: { items: shuffled },
        answer: { order: items.map((item) => item.id) },
        alternatives: [],
      };
    }

    case 'translation': {
      const accepted = Array.from(new Set([input.answer, ...(input.alternatives ?? [])].filter(Boolean) as string[]));
      return {
        questionType: 'translation',
        marks,
        payload: { source: input.source, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage },
        answer: { accepted },
        alternatives: accepted.slice(1),
      };
    }

    default: {
      throw new PracticeError(400, `Unsupported question type: ${String((input as { questionType?: string }).questionType)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Service                                                           */
/* ------------------------------------------------------------------ */

interface QuestionTotals {
  totalQuestions: number;
  totalMarks: number;
}

async function questionTotals(setId: string): Promise<QuestionTotals> {
  const rows = await PracticeQuestionModel.aggregate<{ _id: unknown; total: number; marks: number }>([
    { $match: { setId: new mongoose.Types.ObjectId(setId) } },
    { $group: { _id: '$setId', total: { $sum: 1 }, marks: { $sum: '$marks' } } },
  ]);
  const row = rows[0];
  return { totalQuestions: Number(row?.total ?? 0), totalMarks: Number(row?.marks ?? 0) };
}

/** Stable admin representation shared by list/create/update/publish/duplicate. */
function toSetRow(set: Record<string, unknown>, totals?: QuestionTotals) {
  const totalQuestions = Number(totals?.totalQuestions ?? set.totalQuestions ?? 0);
  const totalMarks = Number(totals?.totalMarks ?? set.totalMarks ?? 0);
  const publicationState = String(set.publicationState ?? 'draft');
  return {
    _id: String(set._id),
    title: String(set.title ?? ''),
    bookId: set.bookId ? String(set.bookId) : '',
    bookTitle: String(set.bookTitle ?? ''),
    subject: String(set.subject ?? ''),
    chapters: Array.isArray(set.chapters) ? set.chapters : [],
    questionType: set.questionType,
    difficulty: set.difficulty,
    instructions: String(set.instructions ?? ''),
    marksPerQuestion: Number(set.marksPerQuestion ?? 1),
    totalQuestions,
    totalMarks,
    practiceModeEnabled: Boolean(set.practiceModeEnabled),
    examModeEnabled: Boolean(set.examModeEnabled),
    examDurationMinutes: set.examDurationMinutes ? Number(set.examDurationMinutes) : null,
    negativeMarking: Number(set.negativeMarking ?? 0),
    allowUnanswered: Boolean(set.allowUnanswered),
    publicationState,
    draft: publicationState !== 'published',
    createdBy: String(set.createdBy ?? ''),
    createdAt: set.createdAt ? new Date(set.createdAt as Date).toISOString() : null,
    questionCount: totalQuestions,
  };
}

/** A set must be usable in at least one mode, and exams need a timer. */
function assertModes(practice: boolean, exam: boolean, duration: number | null): void {
  if (!practice && !exam) {
    throw new PracticeError(400, 'Enable practice mode, exam mode, or both.');
  }
  if (exam && (!duration || duration < 1)) {
    throw new PracticeError(400, 'Exam mode requires a duration between 1 and 600 minutes.');
  }
}

/**
 * Resolves the chapter a question belongs to. The chapter must be one of the
 * set's chapters. A single-chapter set assigns its only chapter by default.
 */
function resolveQuestionChapter(
  setChapters: Array<{ id: string; title: string }>,
  requestedId: string | undefined
): { chapterId: string; chapterTitle: string } {
  const id = (requestedId ?? '').trim();
  if (id) {
    const match = setChapters.find((chapter) => chapter.id === id);
    if (!match) {
      throw new PracticeError(400, 'The question chapter must be one of the chapters selected for this set');
    }
    return { chapterId: match.id, chapterTitle: match.title };
  }
  if (setChapters.length === 1) {
    return { chapterId: setChapters[0].id, chapterTitle: setChapters[0].title };
  }
  return { chapterId: '', chapterTitle: '' };
}

function toQuestionForm(question: Record<string, unknown>): Record<string, unknown> {
  const payload = (question.payload ?? {}) as Record<string, unknown>;
  const answer = (question.answer ?? {}) as Record<string, unknown>;
  const questionType = String(question.questionType ?? 'mcq');
  let form: Record<string, unknown>;

  switch (questionType) {
    case 'mcq': {
      const options = Array.isArray(payload.options) ? payload.options.map((option) => String(option)) : [];
      form = { questionType, question: String(payload.question ?? ''), options, correctIndex: Number(answer.correctIndex ?? 0) };
      break;
    }
    case 'fill_blank': {
      form = { questionType, text: String(payload.text ?? ''), blanks: Array.isArray(answer.blanks) ? answer.blanks : [] };
      break;
    }
    case 'true_false':
      form = { questionType, statement: String(payload.statement ?? ''), correct: Boolean(answer.value) };
      break;
    case 'matching': {
      const left = (Array.isArray(payload.left) ? payload.left : []) as Array<Record<string, unknown>>;
      const right = (Array.isArray(payload.right) ? payload.right : []) as Array<Record<string, unknown>>;
      const pairs = (Array.isArray(answer.pairs) ? answer.pairs : []) as Array<Record<string, unknown>>;
      const leftText = new Map(left.map((item) => [String(item.id ?? ''), String(item.text ?? '')]));
      const rightText = new Map(right.map((item) => [String(item.id ?? ''), String(item.text ?? '')]));
      form = {
        questionType,
        left: left.map((item) => String(item.text ?? '')),
        right: right.map((item) => String(item.text ?? '')),
        // Return text pairs so the editor can round-trip them without leaking IDs.
        pairs: pairs
          .map((pair) => ({
            left: leftText.get(String(pair.leftId ?? '')) ?? '',
            right: rightText.get(String(pair.rightId ?? '')) ?? '',
          }))
          .filter((pair) => pair.left && pair.right),
      };
      break;
    }
    case 'one_word':
    case 'translation': {
      const accepted = Array.isArray(answer.accepted) ? answer.accepted.map((item) => String(item)) : [];
      form = {
        questionType,
        question: String(payload.question ?? payload.source ?? ''),
        answer: accepted[0] ?? '',
        alternatives: accepted.slice(1),
        source: String(payload.source ?? ''),
        sourceLanguage: String(payload.sourceLanguage ?? ''),
        targetLanguage: String(payload.targetLanguage ?? ''),
      };
      break;
    }
    case 'rearrange': {
      const items = (Array.isArray(payload.items) ? payload.items : []) as Array<Record<string, unknown>>;
      const order = Array.isArray(answer.order) ? answer.order.map((value) => String(value)) : [];
      const byId = new Map(items.map((item) => [String(item.id ?? ''), String(item.text ?? '')]));
      const ordered = order.map((id) => byId.get(id)).filter((text): text is string => Boolean(text));
      // The authoring UI edits the correct sequence, never the shuffled display order.
      form = {
        questionType,
        items: ordered.length ? ordered : items.map((item) => String(item.text ?? '')),
      };
      break;
    }
    default:
      form = { questionType, question: String(payload.question ?? '') };
  }

  return {
    _id: String(question._id),
    questionType,
    order: Number(question.order ?? 0),
    marks: Number(question.marks ?? 0),
    chapterId: String(question.chapterId ?? ''),
    chapterTitle: String(question.chapterTitle ?? ''),
    ...form,
    alternatives: Array.isArray(question.alternatives) ? question.alternatives : [],
  };
}

export const adminService = {
  async listSets(filters: {
    bookId?: string;
    chapterIds?: string[];
    questionType?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filters.bookId) query.bookId = filters.bookId;
    if (filters.questionType) query.questionType = filters.questionType;
    if (filters.status) query.publicationState = filters.status;
    if (filters.chapterIds && filters.chapterIds.length > 0) {
      query['chapters.id'] = { $in: filters.chapterIds };
    }
    if (filters.search) {
      query.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { bookTitle: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(filters.limit ?? 20)));
    const skip = (page - 1) * limit;

    const [sets, total] = await Promise.all([
      PracticeQuestionSetModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PracticeQuestionSetModel.countDocuments(query),
    ]);

    const questionRows = await PracticeQuestionModel.aggregate<{ _id: unknown; total: number; marks: number }>([
      { $group: { _id: '$setId', total: { $sum: 1 }, marks: { $sum: '$marks' } } },
    ]);
    const questionTotalsBySet = new Map<string, QuestionTotals>();
    questionRows.forEach((row) => {
      questionTotalsBySet.set(String(row._id), { totalQuestions: Number(row.total ?? 0), totalMarks: Number(row.marks ?? 0) });
    });

    const mapped = sets.map((set) => {
      const doc = set as unknown as Record<string, unknown>;
      const totals = questionTotalsBySet.get(String(doc._id)) ?? { totalQuestions: 0, totalMarks: 0 };
      return toSetRow(doc, totals);
    });

    return { sets: mapped, total, page, limit };
  },

  async createSet(input: CreateQuestionSetInput, adminUserId: string) {
    const book = await BookModel.findById(input.bookId).lean();
    if (!book) {
      throw new PracticeError(404, 'Book not found');
    }
    assertModes(
      input.practiceModeEnabled ?? true,
      input.examModeEnabled ?? false,
      input.examDurationMinutes ?? null
    );

    const chapters = await listChaptersForBook(input.bookId);
    const resolvedChapters = input.chapters
      .map((chapterId) => chapters.find((chapter) => chapter.id === chapterId))
      .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
    if (resolvedChapters.length === 0) {
      throw new PracticeError(400, 'Select at least one chapter that belongs to this book');
    }

    const now = new Date();
    const set = await PracticeQuestionSetModel.create({
      title: input.title,
      bookId: input.bookId,
      bookTitle: String(book.title ?? ''),
      subject: String(book.subject ?? ''),
      chapters: resolvedChapters.map((chapter) => ({ id: chapter.id, title: chapter.title, order: chapter.order })),
      questionType: input.questionType,
      difficulty: input.difficulty ?? 'easy',
      instructions: input.instructions ?? '',
      marksPerQuestion: input.marksPerQuestion ?? 1,
      totalQuestions: 0,
      totalMarks: 0,
      practiceModeEnabled: input.practiceModeEnabled ?? true,
      examModeEnabled: input.examModeEnabled ?? false,
      examDurationMinutes: input.examDurationMinutes ?? null,
      negativeMarking: input.negativeMarking ?? 0,
      allowUnanswered: input.allowUnanswered ?? false,
      publicationState: input.publicationState ?? 'draft',
      createdBy: adminUserId,
      publishedAt: input.publicationState === 'published' ? now : null,
    });

    const doc = set.toObject() as unknown as Record<string, unknown>;
    return { set: toSetRow(doc, { totalQuestions: 0, totalMarks: 0 }), created: true };
  },

  async previewSet(setId: string, adminUserId: string) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    const attempt = await startPracticeAttempt([set as unknown as Record<string, unknown>], 'practice', {
      userId: adminUserId,
      preview: true,
    });
    return { attempt };
  },

  async getSet(setId: string) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    const questions = await PracticeQuestionModel.find({ setId }).sort({ order: 1 }).lean();
    return { set, questions };
  },

  async updateSet(setId: string, input: UpdateQuestionSetInput) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    if (set.questionType && input.questionType && String(set.questionType) !== String(input.questionType)) {
      const questionCount = await PracticeQuestionModel.countDocuments({ setId });
      if (questionCount > 0) {
        throw new PracticeError(400, 'Cannot change the question type of a set that already has questions');
      }
    }
    assertModes(
      input.practiceModeEnabled ?? Boolean(set.practiceModeEnabled),
      input.examModeEnabled ?? Boolean(set.examModeEnabled),
      (input.examDurationMinutes !== undefined ? input.examDurationMinutes : set.examDurationMinutes) ?? null
    );

    const update: Record<string, unknown> = {};
    const textFields = ['title', 'difficulty', 'instructions', 'questionType'] as const;
    for (const field of textFields) {
      if (input[field] !== undefined) update[field] = input[field];
    }
    const numberFields = ['marksPerQuestion', 'negativeMarking', 'examDurationMinutes', 'allowUnanswered', 'practiceModeEnabled', 'examModeEnabled'] as const;
    for (const field of numberFields) {
      if (input[field] !== undefined) update[field] = input[field];
    }
    if (input.bookId) {
      if (input.chapters === undefined) {
        throw new PracticeError(400, 'Select the chapters of the new book');
      }
      const book = await BookModel.findById(input.bookId).lean();
      if (!book) {
        throw new PracticeError(404, 'Book not found');
      }
      update.bookId = input.bookId;
      update.bookTitle = String(book.title ?? '');
      update.subject = String(book.subject ?? '');
    }
    if (input.chapters !== undefined) {
      const bookId = String(input.bookId ?? set.bookId);
      const chapters = await listChaptersForBook(bookId);
      const resolved = input.chapters
        .map((chapterId) => chapters.find((chapter) => chapter.id === chapterId))
        .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
      if (resolved.length === 0) {
        throw new PracticeError(400, 'Select at least one chapter that belongs to this book');
      }
      update.chapters = resolved.map((chapter) => ({ id: chapter.id, title: chapter.title, order: chapter.order }));
    }

    const updated = await PracticeQuestionSetModel.findByIdAndUpdate(setId, { $set: update }, { new: true }).lean();
    const questions = await PracticeQuestionModel.find({ setId }).sort({ order: 1 }).lean();
    const totals = await questionTotals(setId);
    return { set: toSetRow(updated as unknown as Record<string, unknown>, totals), questions };
  },

  async deleteSet(setId: string) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    await PracticeQuestionSetModel.findByIdAndDelete(setId);
    await PracticeQuestionModel.deleteMany({ setId });
    return { deleted: true };
  },

  async publishSet(setId: string) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    const { totalQuestions, totalMarks } = await questionTotals(setId);
    if (totalQuestions === 0 || totalMarks <= 0) {
      throw new PracticeError(400, 'A question set needs at least one question with marks before it can be published');
    }
    assertModes(
      Boolean(set.practiceModeEnabled),
      Boolean(set.examModeEnabled),
      (set.examDurationMinutes as number | null) ?? null
    );
    const book = await BookModel.findById(set.bookId).lean();
    if (!book || book.publicationState !== 'published' || Number(book.chunkCount ?? 0) <= 0) {
      throw new PracticeError(400, 'Publish the book before publishing a question set for it');
    }
    const updated = await PracticeQuestionSetModel.findByIdAndUpdate(
      setId,
      { $set: { publicationState: 'published', publishedAt: new Date() } },
      { new: true }
    ).lean();
    return { set: toSetRow(updated as unknown as Record<string, unknown>, { totalQuestions, totalMarks }) };
  },

  async unpublishSet(setId: string) {
    const updated = await PracticeQuestionSetModel.findByIdAndUpdate(
      setId,
      { $set: { publicationState: 'draft', publishedAt: null } },
      { new: true }
    ).lean();
    const totals = await questionTotals(setId);
    return { set: toSetRow(updated as unknown as Record<string, unknown>, totals) };
  },

  /** Clones a set and all of its questions as a new draft. */
  async duplicateSet(setId: string, adminUserId: string) {
    const source = await PracticeQuestionSetModel.findById(setId).lean();
    if (!source) {
      throw new PracticeError(404, 'Question set not found');
    }
    const questions = await PracticeQuestionModel.find({ setId }).sort({ order: 1 }).lean();
    const totals = {
      totalQuestions: questions.length,
      totalMarks: questions.reduce((sum, question) => sum + Number(question.marks ?? 0), 0),
    };
    const copy = await PracticeQuestionSetModel.create({
      title: `${String(source.title)} (copy)`.slice(0, 200),
      bookId: source.bookId,
      bookTitle: source.bookTitle,
      subject: source.subject,
      chapters: source.chapters,
      questionType: source.questionType,
      difficulty: source.difficulty,
      instructions: source.instructions,
      marksPerQuestion: source.marksPerQuestion,
      ...totals,
      practiceModeEnabled: source.practiceModeEnabled,
      examModeEnabled: source.examModeEnabled,
      examDurationMinutes: source.examDurationMinutes,
      negativeMarking: source.negativeMarking,
      allowUnanswered: source.allowUnanswered,
      publicationState: 'draft',
      publishedAt: null,
      createdBy: adminUserId,
    });
    if (questions.length) {
      await PracticeQuestionModel.insertMany(
        questions.map((question, index) => ({
          setId: copy._id,
          bookId: question.bookId,
          chapterId: question.chapterId,
          chapterTitle: question.chapterTitle,
          questionType: question.questionType,
          order: index + 1,
          marks: question.marks,
          payload: question.payload,
          answer: question.answer,
          alternatives: question.alternatives,
        }))
      );
    }
    return { set: toSetRow(copy.toObject() as unknown as Record<string, unknown>, totals), created: true };
  },

  /** Persists a new question order for a set. */
  async reorderQuestions(setId: string, questionIds: string[]) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    const rows = await PracticeQuestionModel.find({ setId }).select('_id').lean();
    const existing = new Set(rows.map((row) => String(row._id)));
    if (questionIds.length !== existing.size || questionIds.some((id) => !existing.has(id))) {
      throw new PracticeError(400, 'Question order must include every question in the set exactly once');
    }
    await PracticeQuestionModel.bulkWrite(
      questionIds.map((id, index) => ({
        updateOne: { filter: { _id: id, setId }, update: { $set: { order: index + 1 } } },
      }))
    );
    return { reordered: true, totalQuestions: questionIds.length };
  },

  async listQuestions(setId: string) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    const questions = await PracticeQuestionModel.find({ setId }).sort({ order: 1 }).lean();
    return questions.map((question) => toQuestionForm(question as unknown as Record<string, unknown>));
  },

  async createQuestion(setId: string, input: QuestionInput) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    if (input.questionType !== set.questionType) {
      throw new PracticeError(400, 'Question type must match the question set type');
    }

    const normalized = normalizeQuestionInput(input, Number(set.marksPerQuestion ?? 1));
    const chapter = resolveQuestionChapter(
      (set.chapters ?? []) as Array<{ id: string; title: string }>,
      input.chapterId
    );
    const question = await PracticeQuestionModel.create({
      setId,
      bookId: set.bookId,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      questionType: input.questionType,
      order: (await PracticeQuestionModel.countDocuments({ setId })) + 1,
      marks: normalized.marks,
      payload: normalized.payload,
      answer: normalized.answer,
      alternatives: normalized.alternatives,
    });

    const totals = await questionTotals(setId);
    await PracticeQuestionSetModel.updateOne({ _id: setId }, { $set: { ...totals } });

    const questionDoc = (await PracticeQuestionModel.findById(question._id).lean()) as Record<string, unknown>;
    return { question: toQuestionForm(questionDoc), ...totals };
  },

  async updateQuestion(setId: string, questionId: string, input: QuestionInput) {
    const question = await PracticeQuestionModel.findById(questionId).lean();
    if (!question) {
      throw new PracticeError(404, 'Question not found');
    }
    if (String(question.setId) !== setId) {
      throw new PracticeError(404, 'Question not found in this set');
    }

    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    if (input.questionType !== set.questionType) {
      throw new PracticeError(400, 'Question type must match the question set type');
    }
    const normalized = normalizeQuestionInput(input, Number(set.marksPerQuestion ?? 1));
    const chapter = resolveQuestionChapter(
      (set.chapters ?? []) as Array<{ id: string; title: string }>,
      input.chapterId
    );
    const updated = await PracticeQuestionModel.findByIdAndUpdate(
      questionId,
      {
        $set: {
          questionType: input.questionType,
          chapterId: chapter.chapterId,
          chapterTitle: chapter.chapterTitle,
          order: Number(question.order ?? 0),
          marks: normalized.marks,
          payload: normalized.payload,
          answer: normalized.answer,
          alternatives: normalized.alternatives,
        },
      },
      { new: true }
    ).lean();

    const totals = await questionTotals(setId);
    await PracticeQuestionSetModel.updateOne({ _id: setId }, { $set: { ...totals } });

    const questionDoc = (await PracticeQuestionModel.findById(questionId).lean()) as Record<string, unknown>;
    return { question: toQuestionForm(questionDoc), ...totals };
  },

  async deleteQuestion(setId: string, questionId: string) {
    const result = await PracticeQuestionModel.deleteOne({ _id: questionId, setId });
    const totals = await questionTotals(setId);
    await PracticeQuestionSetModel.updateOne({ _id: setId }, { $set: { ...totals } });
    return { deleted: result.deletedCount > 0, ...totals };
  },

  async duplicateQuestion(setId: string, questionId: string) {
    const source = await PracticeQuestionModel.findById(questionId).lean();
    if (!source || String(source.setId) !== setId) {
      throw new PracticeError(404, 'Question not found in this set');
    }
    const order = (await PracticeQuestionModel.countDocuments({ setId })) + 1;
    const copy = await PracticeQuestionModel.create({
      setId,
      bookId: source.bookId,
      chapterId: source.chapterId,
      chapterTitle: source.chapterTitle,
      questionType: source.questionType,
      order,
      marks: source.marks,
      payload: source.payload,
      answer: source.answer,
      alternatives: source.alternatives,
    } as never);
    const copyDoc = (copy as unknown as { toObject(): Record<string, unknown> }).toObject();
    return { question: toQuestionForm(copyDoc) };
  },
};

export default adminService;
