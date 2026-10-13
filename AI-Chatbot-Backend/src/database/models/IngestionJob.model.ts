import mongoose, { Schema, InferSchemaType } from 'mongoose';

/** Background ingestion job for book PDF processing (non-blocking HTTP). */
const ingestionJobSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    kind: { type: String, enum: ['ingest', 'reindex'], default: 'ingest' },
    state: {
      type: String,
      enum: ['queued', 'processing', 'done', 'failed'],
      default: 'queued',
      index: true,
    },
    progress: { type: Number, default: 0 },
    attempt: { type: Number, default: 0 },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    warnings: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'ingestion_jobs' }
);

ingestionJobSchema.index({ bookId: 1, createdAt: -1 });

export type IngestionJobDocument = InferSchemaType<typeof ingestionJobSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const IngestionJobModel = mongoose.model('IngestionJob', ingestionJobSchema);
