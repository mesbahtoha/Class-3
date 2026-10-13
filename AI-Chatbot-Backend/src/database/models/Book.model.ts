import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * Admin-managed Class 3 textbook catalogue. Data-driven ,  never hard-coded.
 * Student RAG queries published books only.
 */
const bookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    grade: { type: String, default: 'Class 3', index: true },
    curriculum: { type: String, default: 'NCTB', index: true },
    subject: { type: String, required: true, index: true },
    language: { type: String, default: 'bn', index: true },
    edition: { type: String, default: '' },
    year: { type: Number, default: null },
    publisher: { type: String, default: '' },
    sourceNotes: { type: String, default: '' },
    rightsStatus: { type: String, default: 'unverified', index: true },
    fileId: { type: Schema.Types.Mixed, default: null },
    fileType: { type: String, default: 'application/pdf' },
    fileSize: { type: Number, default: 0 },
    checksum: { type: String, default: '' },
    pageCount: { type: Number, default: 0 },
    processingState: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    processingError: { type: String, default: '' },
    processingProgress: { type: Number, default: 0 },
    publicationState: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    chunkCount: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    replacesBookId: { type: Schema.Types.ObjectId, ref: 'Book', default: null },
    uploadedBy: { type: String, default: 'admin' },
    reviewedBy: { type: String, default: null },
    publishedBy: { type: String, default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'books' }
);

bookSchema.index({ subject: 1, grade: 1, publicationState: 1 });
bookSchema.index({ title: 'text', subject: 'text' });

export type BookDocument = InferSchemaType<typeof bookSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BookModel = mongoose.model('Book', bookSchema);
