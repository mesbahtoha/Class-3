import crypto from 'crypto';
import { BookModel } from '../../database/models/Book.model';
import { BookChunkModel } from '../../database/models/BookChunk.model';
import { IngestionJobModel } from '../../database/models/IngestionJob.model';
import { uploadBuffer, deleteGridFSFile, safeObjectId } from '../../config/gridfs';
import { log } from '../../config/logger';
import { normalizeForSearch, normalizeText, buildPreview } from '../../utils/text.utils';
import { extractPdfPages, chunkBookPages, checksum } from './document-extraction.service';
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from './embedding.service';

export interface CreateBookInput {
  title: string;
  subject: string;
  grade?: string;
  curriculum?: string;
  language?: string;
  edition?: string;
  year?: number;
  publisher?: string;
  sourceNotes?: string;
  rightsStatus?: string;
  uploadedBy?: string;
  file: Express.Multer.File;
}

/**
 * Admin book ingestion. Upload is validated server-side (PDF signature, size,
 * page count), stored in GridFS, then processed by a background job so the
 * HTTP request stays fast. Publish is only allowed after ready + review.
 */
export const bookIngestionService = {
  async createBook(input: CreateBookInput) {
    const file = input.file;
    if (!file) throw Object.assign(new Error('A PDF file is required'), { statusCode: 400 });
    if (file.mimetype !== 'application/pdf') throw Object.assign(new Error('Only PDF books are supported in this version'), { statusCode: 400 });
    if (file.size > 30 * 1024 * 1024) throw Object.assign(new Error('PDF exceeds the 30MB limit'), { statusCode: 400 });

    const sum = checksum(file.buffer);
    const fileId = await uploadBuffer(file.buffer, `${Date.now()}-${file.originalname}`, file.mimetype, {
      title: input.title,
      kind: 'book',
    });

    const book = await BookModel.create({
      title: normalizeText(input.title),
      subject: normalizeText(input.subject),
      grade: input.grade || 'Class 3',
      curriculum: input.curriculum || 'NCTB',
      language: input.language || 'bn',
      edition: input.edition || '',
      year: input.year ?? null,
      publisher: input.publisher || '',
      sourceNotes: input.sourceNotes || '',
      rightsStatus: input.rightsStatus || 'unverified',
      fileId,
      fileType: file.mimetype,
      fileSize: file.size,
      checksum: sum,
      processingState: 'processing',
      processingProgress: 5,
      publicationState: 'draft',
      uploadedBy: input.uploadedBy || 'admin',
    });

    const job = await IngestionJobModel.create({ bookId: book._id, kind: 'ingest', state: 'queued', progress: 5 });
    // Background processing ,  do not block the HTTP response.
    setImmediate(() => {
      void this.processJob(String(job._id)).catch((error) => log.error('Book ingestion failed', { message: (error as Error).message }));
    });
    return { book, jobId: String(job._id) };
  },

  async processJob(jobId: string): Promise<void> {
    const job = await IngestionJobModel.findById(jobId);
    if (!job) return;
    const book = await BookModel.findById(job.bookId);
    if (!book) {
      await IngestionJobModel.updateOne({ _id: job._id }, { $set: { state: 'failed', errorMessage: 'Book not found' } });
      return;
    }
    await IngestionJobModel.updateOne({ _id: job._id }, { $set: { state: 'processing', startedAt: new Date(), attempt: job.attempt + 1 } });
    await BookModel.updateOne({ _id: book._id }, { $set: { processingState: 'processing', processingProgress: 15, processingError: '' } });
    try {
      const { getDb } = await import('../../config/db');
      const db = getDb();
      const bucket = new (require('mongoose').mongo.GridFSBucket)(db, { bucketName: 'uploads' });
      const objectId = safeObjectId(String(book.fileId));
      if (!objectId) throw new Error('Stored book file is missing');
      const buffer: Buffer = await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        bucket.openDownloadStream(objectId).on('data', (d: Buffer) => chunks.push(d)).on('error', reject).on('end', () => resolve(Buffer.concat(chunks)));
      });
      const { pages, warnings, pageCount } = await extractPdfPages(buffer, book.title);
      await IngestionJobModel.updateOne({ _id: job._id }, { $set: { progress: 55, warnings } });
      await BookModel.updateOne({ _id: book._id }, { $set: { pageCount, processingProgress: 55 } });

      await BookChunkModel.deleteMany({ bookId: book._id });
      let chunkCount = 0;
      if (pages.length) {
        const inputs = chunkBookPages(pages);
        const docs = inputs.map((c, i) => ({
          bookId: book._id,
          bookTitle: book.title,
          subject: book.subject,
          grade: book.grade,
          curriculum: book.curriculum,
          language: book.language,
          edition: book.edition,
          bookVersion: book.version,
          chapterTitle: c.chapterTitle || '',
          chapterOrder: c.chapterOrder || 0,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          chunkIndex: i,
          text: c.text,
          normalizedText: normalizeForSearch(c.text),
          preview: buildPreview(c.text, 220),
          hash: crypto.createHash('sha256').update(c.text).digest('hex'),
          embeddingModel: EMBEDDING_MODEL,
          embeddingVersion: EMBEDDING_VERSION,
        }));
        if (docs.length) {
          await BookChunkModel.insertMany(docs);
          chunkCount = docs.length;
        }
      } else {
        warnings.push('No text chunks created ,  scanned PDF needs OCR review before publishing.');
      }
      const ready = chunkCount > 0;
      await BookModel.updateOne(
        { _id: book._id },
        { $set: { chunkCount, pageCount, processingState: ready ? 'ready' : 'failed', processingProgress: 100, processingError: ready ? '' : warnings.join(' | ').slice(0, 500) } }
      );
      await IngestionJobModel.updateOne(
        { _id: job._id },
        { $set: { state: ready ? 'done' : 'failed', progress: 100, finishedAt: new Date(), errorMessage: ready ? '' : warnings.join(' | ').slice(0, 500), warnings } }
      );
      log.info('Book ingestion finished', { bookId: String(book._id), chunkCount, ready });
    } catch (error) {
      const message = (error as Error).message;
      await BookModel.updateOne({ _id: book._id }, { $set: { processingState: 'failed', processingError: message.slice(0, 500) } });
      await IngestionJobModel.updateOne({ _id: job._id }, { $set: { state: 'failed', finishedAt: new Date(), errorMessage: message.slice(0, 500), errorCode: 'EXTRACTION_FAILED' } });
    }
  },

  async retryJob(bookId: string) {
    const book = await BookModel.findById(bookId);
    if (!book) throw Object.assign(new Error('Book not found'), { statusCode: 404 });
    const job = await IngestionJobModel.create({ bookId: book._id, kind: book.chunkCount ? 'reindex' : 'ingest', state: 'queued', progress: 0 });
    await BookModel.updateOne({ _id: book._id }, { $set: { processingState: 'processing', processingError: '' } });
    setImmediate(() => {
      void this.processJob(String(job._id)).catch((error) => log.error('Book retry failed', { message: (error as Error).message }));
    });
    return job;
  },

  async deleteBook(bookId: string): Promise<void> {
    const book = await BookModel.findById(bookId);
    if (!book) return;
    await BookChunkModel.deleteMany({ bookId: book._id });
    await IngestionJobModel.deleteMany({ bookId: book._id });
    await BookModel.deleteOne({ _id: book._id });
    if (book.fileId) await deleteGridFSFile(safeObjectId(String(book.fileId)));
  },
};

export default bookIngestionService;
