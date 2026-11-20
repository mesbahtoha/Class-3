import mongoose, { Schema, InferSchemaType } from 'mongoose';
import { PRACTICE_MODES, PRACTICE_QUESTION_TYPES } from '../../constants';

/**
 * Snapshot of a question inside an attempt.
 *
 * The snapshot is taken when the attempt starts so that later admin edits can
 * never change an exam that is already in progress. `answer` / `alternatives`
 * are only ever exposed by the results endpoints, never by question-fetching
 * endpoints.
 */
const attemptQuestionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    questionType: { type: String, enum: PRACTICE_QUESTION_TYPES, required: true },
    order: { type: Number, default: 0 },
    chapterId: { type: String, default: '' },
    chapterTitle: { type: String, default: '' },
    marks: { type: Number, default: 1 },
    payload: { type: Schema.Types.Mixed, required: true },
    answer: { type: Schema.Types.Mixed, required: true },
    alternatives: { type: [String], default: [] },
  },
  { _id: false }
);

/** One saved student answer. `value` follows the question-type contract. */
const attemptAnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    value: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** Per-question evaluation outcome stored with a submitted attempt. */
const attemptResultSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    questionType: { type: String, enum: PRACTICE_QUESTION_TYPES, required: true },
    order: { type: Number, default: 0 },
    marks: { type: Number, default: 0 },
    marksAwarded: { type: Number, default: 0 },
    answered: { type: Boolean, default: false },
    correct: { type: Boolean, default: false },
    studentAnswer: { type: Schema.Types.Mixed, default: null },
    correctAnswer: { type: Schema.Types.Mixed, default: null },
    breakdown: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const chapterRefSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

/**
 * A single student attempt (practice or exam).
 *
 * Practice attempts are repeatable; duplicates of the *same* attempt are
 * prevented by the atomic `in_progress -> submitted` transition in the
 * service layer.
 */
const practiceAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    setId: {
      type: Schema.Types.ObjectId,
      ref: 'PracticeQuestionSet',
      required: true,
      index: true,
    },
    title: { type: String, default: '' },
    mode: { type: String, enum: PRACTICE_MODES, required: true, index: true },
    status: {
      type: String,
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
      index: true,
    },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    bookTitle: { type: String, default: '' },
    subject: { type: String, default: '' },
    chapters: { type: [chapterRefSchema], default: [] },
    questionType: { type: String, enum: PRACTICE_QUESTION_TYPES, required: true },
    questions: { type: [attemptQuestionSchema], default: [] },
    answers: { type: [attemptAnswerSchema], default: [] },
    results: { type: [attemptResultSchema], default: [] },
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    obtainedMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    negativeMarking: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: null },
    expiresAt: { type: Date, default: null },
    autoSubmitted: { type: Boolean, default: false },
    preview: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'practice_attempts' }
);

practiceAttemptSchema.index({ userId: 1, createdAt: -1 });
practiceAttemptSchema.index({ userId: 1, status: 1 });
practiceAttemptSchema.index({ setId: 1, status: 1 });
practiceAttemptSchema.index({ status: 1, expiresAt: 1 });

export type PracticeAttemptDocument = InferSchemaType<typeof practiceAttemptSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PracticeAttemptModel = mongoose.model(
  'PracticeAttempt',
  practiceAttemptSchema
);
