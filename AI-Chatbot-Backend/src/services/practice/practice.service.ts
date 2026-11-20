import mongoose from 'mongoose';
import { BookModel } from '../../database/models/Book.model';
import { PracticeQuestionModel } from '../../database/models/PracticeQuestion.model';
import { PracticeQuestionSetModel } from '../../database/models/PracticeQuestionSet.model';
import { PracticeAttemptModel } from '../../database/models/PracticeAttempt.model';
import { PRACTICE_MODES } from '../../constants';
import { evaluateAttempt } from './attempt-evaluator.service';
import { listChaptersForBook } from './chapters.service';
import { ChapterRef, QuestionSnapshot } from './types';
import { PracticeError } from './types';

interface AttemptAnswerEntry {
  questionId: string;
  value: unknown;
}

interface QuestionDocLike {
  _id: unknown;
  questionId?: unknown;
  questionType: string;
  order: number;
  marks: number;
  payload: Record<string, unknown>;
  answer: Record<string, unknown>;
  alternatives?: unknown;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function questionSnapshot(question: QuestionDocLike): QuestionSnapshot {
  const payload: Record<string, unknown> = { ...(question.payload ?? {}) };
  const answer: Record<string, unknown> = { ...(question.answer ?? {}) };
  return {
    questionId: String(question.questionId ?? question._id),
    questionType: (question.questionType as QuestionSnapshot['questionType']) || 'mcq',
    order: Number(question.order ?? 0),
    marks: Number(question.marks ?? 0),
    payload: payload as unknown as QuestionSnapshot['payload'],
    answer: answer as unknown as QuestionSnapshot['answer'],
    alternatives: Array.isArray(question.alternatives) ? (question.alternatives as unknown[]).map((i) => String(i)) : [],
  };
}

function isEmptyAnswer(value: unknown): boolean {
  const entries: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Object.keys(value as object).length > 0
      ? [value]
      : [value];

  if (Array.isArray(value)) {
    const nonEmpty = value.some((item) => String(item ?? '').trim().length > 0);
    if (!nonEmpty) return true;
    return false;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    const hasContent = Object.keys(objectValue).some((key) => {
      const child = objectValue[key];
      const childText = Array.isArray(child) ? child.map((c) => String(c ?? '')).join(',') : String(child ?? '');
      return String(childText ?? '').trim().length > 0;
    });
    if (!hasContent) return true;
    return false;
  }

  const normalized = String(value ?? '').trim();
  return normalized.length === 0;
}

function toPublicQuestion(snapshot: QuestionSnapshot, options: { reveal?: boolean } = {}) {
  const publicQuestion = {
    questionId: snapshot.questionId,
    questionType: snapshot.questionType,
    order: snapshot.order,
    marks: snapshot.marks,
    payload: snapshot.payload,
  };
  // In practice mode the student may see the correct answer while answering
  // ("am I correct?"); exam mode keeps answers hidden until submission.
  if (options.reveal) {
    return { ...publicQuestion, answer: snapshot.answer };
  }
  return publicQuestion;
}

function toPublicAttempt(attempt: Record<string, unknown>, options: { includeResults?: boolean } = {}) {
  const questions = (Array.isArray(attempt.questions) ? attempt.questions : []) as QuestionSnapshot[];
  const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const results = Array.isArray(attempt.results) ? (attempt.results as Array<Record<string, unknown>>) : [];
  const revealAnswers = attempt.mode === 'practice';

  const publicAttempt: Record<string, unknown> = {
    _id: String(attempt._id),
    userId: attempt.userId ? String(attempt.userId) : '',
    setId: attempt.setId ? String(attempt.setId) : '',
    title: String(attempt.title ?? ''),
    mode: attempt.mode,
    status: attempt.status,
    preview: Boolean(attempt.preview),
    bookId: attempt.bookId ? String(attempt.bookId) : '',
    bookTitle: String(attempt.bookTitle ?? ''),
    subject: String(attempt.subject ?? ''),
    chapters: Array.isArray(attempt.chapters) ? (attempt.chapters as ChapterRef[]) : [],
    questionType: attempt.questionType,
    questions: questions.map((question) => toPublicQuestion(question, { reveal: revealAnswers })),
    answers,
    totalQuestions: Number(attempt.totalQuestions ?? questions.length),
    totalMarks: Number(attempt.totalMarks ?? 0),
    obtainedMarks: Number(attempt.obtainedMarks ?? 0),
    percentage: Number(attempt.percentage ?? 0),
    durationMinutes: attempt.durationMinutes ? Number(attempt.durationMinutes) : null,
    expiresAt: attempt.expiresAt ? new Date(attempt.expiresAt as string | number | Date).toISOString() : null,
    startedAt: new Date(attempt.startedAt as string | number | Date).toISOString(),
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt as string | number | Date).toISOString() : null,
  };

  if (options.includeResults && attempt.status === 'submitted') {
    publicAttempt.obtainedMarks = Number(attempt.obtainedMarks ?? 0);
    publicAttempt.percentage = Number(attempt.percentage ?? 0);
    publicAttempt.totalMarks = Number(attempt.totalMarks ?? 0);
    publicAttempt.totalQuestions = Number(attempt.totalQuestions ?? questions.length);
    publicAttempt.correctCount = Number(attempt.correctCount ?? 0);
    publicAttempt.incorrectCount = Number(attempt.incorrectCount ?? 0);
    publicAttempt.unansweredCount = Number(attempt.unansweredCount ?? 0);
    publicAttempt.autoSubmitted = Boolean(attempt.autoSubmitted);
    publicAttempt.results = results.map((result) => ({
      questionId: String(result.questionId),
      questionType: result.questionType,
      order: Number(result.order ?? 0),
      marks: Number(result.marks ?? 0),
      marksAwarded: Number(result.marksAwarded ?? 0),
      answered: Boolean(result.answered),
      correct: Boolean(result.correct),
      studentAnswer: result.studentAnswer ?? null,
      correctAnswer: result.correctAnswer,
      breakdown: Array.isArray(result.breakdown) ? result.breakdown : [],
    }));
  }

  return publicAttempt;
}

async function applyEvaluation(attempt: Record<string, unknown>, options: { autoSubmitted?: boolean } = {}) {
  const questions = (Array.isArray(attempt.questions) ? attempt.questions : []) as QuestionSnapshot[];
  const answers = (Array.isArray(attempt.answers) ? attempt.answers : []) as Array<{ questionId: string; value: unknown }>;
  const evaluation = evaluateAttempt(
    questions,
    answers.map((entry) => ({ questionId: String(entry.questionId), value: entry.value })),
    Number(attempt.negativeMarking ?? 0)
  );

  const submission: Record<string, unknown> = {
    status: 'submitted',
    results: evaluation.results,
    obtainedMarks: evaluation.obtainedMarks,
    percentage: evaluation.percentage,
    totalMarks: evaluation.totalMarks,
    totalQuestions: evaluation.totalQuestions,
    correctCount: evaluation.correctCount,
    incorrectCount: evaluation.incorrectCount,
    unansweredCount: evaluation.unansweredCount,
    submittedAt: new Date(),
    autoSubmitted: Boolean(options.autoSubmitted),
  };

  const updated = await PracticeAttemptModel.findOneAndUpdate(
    { _id: attempt._id, userId: attempt.userId, status: 'in_progress' },
    { $set: submission },
    { new: true }
  );

  if (!updated) {
    const existing = await PracticeAttemptModel.findOne({ _id: attempt._id, userId: attempt.userId }).lean();
    return { attempt: existing };
  }

  const doc = updated.toObject();
  return { attempt: doc };
}

async function loadAttempt(userId: string, attemptId: string): Promise<Record<string, unknown>> {
  const attempt = await PracticeAttemptModel.findOne({ _id: attemptId, userId }).lean();
  if (!attempt) {
    throw new PracticeError(404, 'Attempt not found');
  }

  const isExpired = Boolean(attempt.expiresAt && new Date(attempt.expiresAt).getTime() <= Date.now());
  if (attempt.status === 'in_progress' && isExpired) {
    const applied = await applyEvaluation(attempt, { autoSubmitted: true });
    return { ...applied.attempt, status: 'submitted', autoSubmitted: true };
  }
  return attempt;
}

/* ------------------------------------------------------------------ */
/* Attempts                                                          */
/* ------------------------------------------------------------------ */

export async function startPracticeAttempt(
  set: Record<string, unknown>,
  setId: string,
  mode: 'practice' | 'exam',
  options: { chapters?: ChapterRef[]; preview?: boolean; previewUserId?: string } = {}
): Promise<Record<string, unknown>> {
  const isPreview = Boolean(options.preview);
  if (mode === 'exam') {
    if (!Boolean(set.examModeEnabled) && !isPreview) {
      throw new PracticeError(400, 'Exam mode is not enabled for this question set');
    }
  } else if (!Boolean(set.practiceModeEnabled) && !isPreview) {
    throw new PracticeError(400, 'Practice mode is not enabled for this question set');
  }

  const selectedChapters = options.chapters && options.chapters.length > 0 ? options.chapters : Array.isArray(set.chapters) ? set.chapters : [];
  const chapterIds = selectedChapters.map((chapter) => chapter.id).filter(Boolean);

  const questionDocs = await PracticeQuestionModel.find({
    setId,
    ...(chapterIds.length > 0 ? { chapterId: { $in: chapterIds } } : {}),
  })
    .sort({ order: 1 })
    .lean();

  if (questionDocs.length === 0) {
    throw new PracticeError(404, 'No questions found for the selected chapters');
  }

  const questions = questionDocs.map((question) => questionSnapshot(question as unknown as QuestionDocLike));
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);

  const attempt = await PracticeAttemptModel.create({
    userId: options.preview ? String(options.previewUserId ?? (set.createdBy as string) ?? '') : await resolveAttemptUserId(setId),
    setId,
    title: String(set.title ?? ''),
    mode,
    status: 'in_progress',
    bookId: set.bookId,
    bookTitle: String(set.bookTitle ?? ''),
    subject: String(set.subject ?? ''),
    chapters: Array.isArray(set.chapters) ? set.chapters : [],
    questionType: set.questionType,
    questions: questions.map((question) => ({
      questionId: question.questionId,
      questionType: question.questionType,
      order: question.order,
      chapterId: '',
      chapterTitle: '',
      marks: question.marks,
      payload: question.payload,
      answer: question.answer,
      alternatives: question.alternatives,
    })),
    answers: [],
    totalQuestions: questions.length,
    totalMarks,
    negativeMarking: Number(set.negativeMarking ?? 0),
    durationMinutes: set.examDurationMinutes ? Number(set.examDurationMinutes) : null,
    expiresAt:
      mode === 'exam' && set.examDurationMinutes ? new Date(Date.now() + Number(set.examDurationMinutes) * 60 * 1000) : null,
    autoSubmitted: false,
    preview: isPreview,
  });

  const doc = attempt.toObject();
  return toPublicAttempt(doc);
}

async function resolveAttemptUserId(setId: string): Promise<string> {
  const set = await PracticeQuestionSetModel.findById(setId).lean();
  const createdBy = String((set as Record<string, unknown> | null)?.createdBy ?? '');
  if (!createdBy) return new mongoose.Types.ObjectId().toString();
  try {
    return new mongoose.Types.ObjectId(createdBy).toString();
  } catch {
    return createdBy;
  }
}

const practiceService = {
  async listStudentBooks() {
    const books = await BookModel.find({ publicationState: 'published' }).sort({ subject: 1, title: 1 }).limit(100).lean();
    return books.map((book) => ({
      _id: String(book._id),
      title: String(book.title ?? ''),
      subject: String(book.subject ?? ''),
      grade: String(book.grade ?? 'Class 3'),
      curriculum: String(book.curriculum ?? ''),
      language: String(book.language ?? 'bn'),
      edition: String(book.edition ?? ''),
      publisher: String(book.publisher ?? ''),
      chunkCount: Number(book.chunkCount ?? 0),
      pageCount: Number(book.pageCount ?? 0),
    }));
  },

  async listStudentChapters(bookId: string) {
    return listChaptersForBook(bookId);
  },

  async listStudentSets(filters: { bookId?: string; chapterIds?: string[]; questionType?: string; mode?: 'practice' | 'exam' }) {
    const query: Record<string, unknown> = { publicationState: 'published' };
    if (filters.bookId) query.bookId = filters.bookId;
    if (filters.questionType) query.questionType = filters.questionType;
    if (filters.mode) {
      if (filters.mode === 'practice') query.practiceModeEnabled = true;
      if (filters.mode === 'exam') query.examModeEnabled = true;
    }
    if (filters.chapterIds && filters.chapterIds.length > 0) {
      query['chapters.id'] = { $in: filters.chapterIds };
    }

    const sets = await PracticeQuestionSetModel.find(query).sort({ createdAt: -1 }).limit(100).lean();
    return sets.map((set) => ({
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
      totalQuestions: Number(set.totalQuestions ?? 0),
      totalMarks: Number(set.totalMarks ?? 0),
      practiceModeEnabled: Boolean(set.practiceModeEnabled),
      examModeEnabled: Boolean(set.examModeEnabled),
      examDurationMinutes: set.examDurationMinutes ? Number(set.examDurationMinutes) : null,
      negativeMarking: Number(set.negativeMarking ?? 0),
      allowUnanswered: Boolean(set.allowUnanswered),
      draft: set.publicationState === 'draft',
    }));
  },

  async getStudentSet(setId: string) {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set || set.publicationState !== 'published') {
      throw new PracticeError(404, 'Question set not found');
    }
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
      practiceModeEnabled: Boolean(set.practiceModeEnabled),
      examModeEnabled: Boolean(set.examModeEnabled),
      examDurationMinutes: set.examDurationMinutes ? Number(set.examDurationMinutes) : null,
      negativeMarking: Number(set.negativeMarking ?? 0),
      allowUnanswered: Boolean(set.allowUnanswered),
    };
  },

  startAttempt: (userId: string, setId: string, mode: 'practice' | 'exam', options: { chapters?: ChapterRef[]; preview?: boolean } = {}) =>
    (async () => {
      const set = await PracticeQuestionSetModel.findById(setId).lean();
      if (!set || set.publicationState !== 'published') {
        throw new PracticeError(404, 'Question set not found');
      }
      return startPracticeAttempt(set as Record<string, unknown>, setId, mode, options);
    })(),

  previewSet: async (setId: string) => {
    const set = await PracticeQuestionSetModel.findById(setId).lean();
    if (!set) {
      throw new PracticeError(404, 'Question set not found');
    }
    const attempt = await startPracticeAttempt(set as Record<string, unknown>, setId, 'practice', { preview: true });
    return { attempt, set: attempt };
  },

  async getAttempt(userId: string, attemptId: string) {
    const attempt = await loadAttempt(userId, attemptId);
    const isSubmitted = attempt.status === 'submitted';
    const isExpired = Boolean(attempt.expiresAt && new Date(attempt.expiresAt as string | number | Date).getTime() <= Date.now());

    if (!isSubmitted && !isExpired) {
      return { attempt: toPublicAttempt(attempt), evaluation: null, duplicate: false, autoSubmitted: false };
    }

    const applied = await applyEvaluation(attempt, { autoSubmitted: isExpired });
    const publicAttempt = toPublicAttempt((applied.attempt || attempt) as Record<string, unknown>, { includeResults: true });

    return { attempt: publicAttempt, evaluation: applied, duplicate: false, autoSubmitted: Boolean(isExpired) };
  },

  async saveAnswers(userId: string, attemptId: string, answers: AttemptAnswerEntry[]) {
    const attempt = await loadAttempt(userId, attemptId);
    const isSubmitted = attempt.status === 'submitted';
    const cleaned = answers.filter((entry) => entry && typeof entry.questionId === 'string');

    if (cleaned.length === 0) {
      return { attempt: toPublicAttempt(attempt, { includeResults: isSubmitted }), autoSubmitted: false, duplicate: false };
    }

    const updated = await PracticeAttemptModel.findOneAndUpdate(
      { _id: attemptId, userId, status: 'in_progress', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      { $set: { answers: cleaned } },
      { new: true }
    );

    if (!updated) {
      const current = await PracticeAttemptModel.findOne({ _id: attemptId, userId }).lean();
      if (current && current.status === 'submitted') {
        throw new PracticeError(409, 'This practice session has already been submitted');
      }
      const resolved = await loadAttempt(userId, attemptId);
      const applied = await applyEvaluation(resolved, { autoSubmitted: true });
      const publicAttempt = toPublicAttempt((applied.attempt || resolved) as Record<string, unknown>, { includeResults: true });
      return { attempt: publicAttempt, autoSubmitted: true, duplicate: false };
    }

    const doc = updated.toObject();
    return { attempt: toPublicAttempt(doc, { includeResults: isSubmitted }), autoSubmitted: false, duplicate: false };
  },

  async submitAttempt(userId: string, attemptId: string, answers: AttemptAnswerEntry[] = []) {
    const attempt = await loadAttempt(userId, attemptId);
    const isSubmitted = attempt.status === 'submitted';

    if (isSubmitted) {
      const existing = await PracticeAttemptModel.findOne({ _id: attemptId, userId }).lean();
      return { attempt: toPublicAttempt(existing as Record<string, unknown>, { includeResults: true }), evaluation: null, duplicate: true, autoSubmitted: false };
    }

    const resolved = await loadAttempt(userId, attemptId);
    const isExpired = Boolean(resolved.expiresAt && new Date(resolved.expiresAt as string | number | Date).getTime() <= Date.now());
    const finalAutoSubmitted = isExpired;

    const sourceAnswers = Array.isArray((resolved as { answers?: AttemptAnswerEntry[] }).answers)
      ? (resolved as { answers: AttemptAnswerEntry[] }).answers
      : [];
    const entries: AttemptAnswerEntry[] =
      answers.length > 0
        ? answers
        : sourceAnswers.map((entry) => ({ questionId: String(entry.questionId), value: entry.value }));

    if (resolved.status === 'in_progress' && !finalAutoSubmitted && resolved.mode === 'exam' && resolved.allowUnanswered !== true) {
      const answeredIds = new Set(entries.filter((entry) => typeof entry.questionId === 'string').map((entry) => entry.questionId));
      const unanswered = (Array.isArray(resolved.questions) ? resolved.questions : []).filter(
        (question) => !answeredIds.has(String(question.questionId))
      );
      if (unanswered.length > 0) {
        throw new PracticeError(400, `You have ${unanswered.length} unanswered question(s). Please answer all before submitting.`);
      }
    }

    const submitted = await applyEvaluation(resolved, { autoSubmitted: finalAutoSubmitted });
    const publicAttempt = toPublicAttempt((submitted.attempt || resolved) as Record<string, unknown>, { includeResults: true });

    return { attempt: publicAttempt, evaluation: submitted, duplicate: false, autoSubmitted: finalAutoSubmitted };
  },

  async listAttempts(userId: string, filters: { mode?: 'practice' | 'exam'; limit?: number } = {}) {
    const query: Record<string, unknown> = { userId, preview: { $ne: true } };
    if (filters.mode) query.mode = filters.mode;

    const attempts = await PracticeAttemptModel.find(query).sort({ createdAt: -1 }).limit(filters.limit ?? 20).lean();
    return attempts.map((attempt) => ({
      _id: String(attempt._id),
      setId: attempt.setId ? String(attempt.setId) : '',
      title: String(attempt.title ?? ''),
      mode: attempt.mode,
      status: attempt.status,
      bookTitle: String(attempt.bookTitle ?? ''),
      subject: String(attempt.subject ?? ''),
      questionType: attempt.questionType,
      totalQuestions: Number(attempt.totalQuestions ?? 0),
      totalMarks: Number(attempt.totalMarks ?? 0),
      obtainedMarks: Number(attempt.obtainedMarks ?? 0),
      percentage: Number(attempt.percentage ?? 0),
      startedAt: new Date(attempt.startedAt).toISOString(),
      submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : null,
      autoSubmitted: Boolean(attempt.autoSubmitted),
    }));
  },
};

export default practiceService;
export { PRACTICE_MODES };
