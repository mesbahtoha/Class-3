import mongoose, { Schema, InferSchemaType } from 'mongoose';

/** Searchable chunks of published textbooks with real page references. */
const bookChunkSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    bookTitle: { type: String, default: '' },
    subject: { type: String, default: '', index: true },
    grade: { type: String, default: 'Class 3' },
    curriculum: { type: String, default: 'NCTB' },
    language: { type: String, default: 'bn' },
    edition: { type: String, default: '' },
    bookVersion: { type: Number, default: 1 },
    chapterId: { type: String, default: null },
    chapterTitle: { type: String, default: '' },
    chapterOrder: { type: Number, default: 0 },
    pageStart: { type: Number, default: null },
    pageEnd: { type: Number, default: null },
    chunkIndex: { type: Number, default: 0 },
    text: { type: String, default: '' },
    normalizedText: { type: String, default: '' },
    preview: { type: String, default: '' },
    hash: { type: String, default: '', index: true },
    embeddingModel: { type: String, default: 'keyword-v1' },
    embeddingVersion: { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'book_chunks' }
);

bookChunkSchema.index({ bookId: 1, chunkIndex: 1 });
bookChunkSchema.index({ bookTitle: 'text', text: 'text', normalizedText: 'text', chapterTitle: 'text' });

export type BookChunkDocument = InferSchemaType<typeof bookChunkSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BookChunkModel = mongoose.model('BookChunk', bookChunkSchema);
