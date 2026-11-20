import mongoose, { Schema, InferSchemaType } from 'mongoose';
import { PRACTICE_QUESTION_TYPES } from '../../constants';

/**
 * A single question inside a practice/exam set.
 *
 * `payload` holds what the student sees (question text, options, matching
 * columns, source sentence, ...). `answer` holds the authoritative answer and
 * `alternatives` holds extra accepted spellings/translations. Both answer
 * fields are stripped from every student-facing API before submission.
 */
const practiceQuestionSchema = new Schema(
  {
    setId: {
      type: Schema.Types.ObjectId,
      ref: 'PracticeQuestionSet',
      required: true,
      index: true,
    },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    chapterId: { type: String, default: '', index: true },
    chapterTitle: { type: String, default: '', trim: true },
    questionType: {
      type: String,
      enum: PRACTICE_QUESTION_TYPES,
      required: true,
      index: true,
    },
    order: { type: Number, default: 0, index: true },
    marks: { type: Number, default: 1, min: 0, max: 100 },
    payload: { type: Schema.Types.Mixed, required: true },
    answer: { type: Schema.Types.Mixed, required: true },
    alternatives: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'practice_questions' }
);

practiceQuestionSchema.index({ setId: 1, order: 1 });
practiceQuestionSchema.index({ setId: 1, chapterId: 1 });

export type PracticeQuestionDocument = InferSchemaType<typeof practiceQuestionSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PracticeQuestionModel = mongoose.model(
  'PracticeQuestion',
  practiceQuestionSchema
);
