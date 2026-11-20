import mongoose, { Schema, InferSchemaType } from 'mongoose';
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_PUBLICATION_STATES,
  PRACTICE_QUESTION_TYPES,
} from '../../constants';

/**
 * Admin-authored question set for the Class 3 Practice & Examination system.
 * A set is always tied to an existing Book and one or more chapters that were
 * imported into BookChunk, so no book or chapter records are duplicated.
 */
const chapterRefSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const practiceQuestionSetSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    bookTitle: { type: String, default: '', trim: true },
    subject: { type: String, default: '', trim: true, index: true },
    chapters: { type: [chapterRefSchema], default: [] },
    questionType: {
      type: String,
      enum: PRACTICE_QUESTION_TYPES,
      required: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: PRACTICE_DIFFICULTIES,
      default: 'easy',
      index: true,
    },
    instructions: { type: String, default: '', maxlength: 2000 },
    marksPerQuestion: { type: Number, default: 1, min: 0, max: 100 },
    totalQuestions: { type: Number, default: 0, min: 0 },
    totalMarks: { type: Number, default: 0, min: 0 },
    practiceModeEnabled: { type: Boolean, default: true },
    examModeEnabled: { type: Boolean, default: false },
    examDurationMinutes: { type: Number, default: null, min: 1, max: 600 },
    negativeMarking: { type: Number, default: 0, min: 0, max: 50 },
    allowUnanswered: { type: Boolean, default: false },
    publicationState: {
      type: String,
      enum: PRACTICE_PUBLICATION_STATES,
      default: 'draft',
      index: true,
    },
    createdBy: { type: String, default: '' },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'practice_question_sets' }
);

practiceQuestionSetSchema.index({ publicationState: 1, bookId: 1, questionType: 1 });
practiceQuestionSetSchema.index({ publicationState: 1, 'chapters.id': 1 });
practiceQuestionSetSchema.index({ title: 'text', bookTitle: 'text' });

export type PracticeQuestionSetDocument = InferSchemaType<typeof practiceQuestionSetSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PracticeQuestionSetModel = mongoose.model(
  'PracticeQuestionSet',
  practiceQuestionSetSchema
);
