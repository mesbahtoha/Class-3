import mongoose, { Schema } from 'mongoose';
import type { DocsDraft } from './DocumentationContent.model';

/**
 * A published version of the documentation snapshot, for version history and
 * restore ("Maintain version history and support restoring previous versions").
 */
export interface DocumentationVersionDoc extends mongoose.Document {
  createdAt: Date;
  updatedAt: Date;
  version: number;
  content: DocsDraft;
  publishedBy: string;
  publishedAt: Date;
}

const documentationVersionSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true, index: true },
    content: { type: Object, required: true },
    publishedBy: { type: String, default: '' },
    publishedAt: { type: Date, default: new Date() },
  },
  { timestamps: true, collection: 'documentation_versions' }
);

export const DocumentationVersionModel = mongoose.model('DocumentationVersion', documentationVersionSchema);

export default DocumentationVersionModel;
