import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BookModel } from '../../database/models/Book.model';
import { BookChunkModel } from '../../database/models/BookChunk.model';
import { IngestionJobModel } from '../../database/models/IngestionJob.model';
import { uploadBuffer, deleteGridFSFile, safeObjectId } from '../../config/gridfs';
import { log } from '../../config/logger';
import env from '../../config/env';
import { buildPreview, chunkSearchTerms, normalizeForIndex, normalizeText } from '../../utils/text.utils';
import {
  extractPdfPages,
  chunkBookPages,
  cleanPageTexts,
  detectChapters,
  checksum,
  isTableOfContents,
  type PageText,
} from './document-extraction.service';
import { openPdf } from './pdf-pages.service';
import { getOcrConfig, ocrPage, setOcrConfig, type OcrProvider } from './ocr.service';
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from './embedding.service';
import { stableChapterId } from '../practice/chapters.service';

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

export interface IngestOptions {
  force?: boolean;
  publish?: boolean;
  ocrScale?: number;
  ocrProvider?: OcrProvider;
  ocrModel?: string;
  ocrConcurrency?: number;
  maxPages?: number;
  onProgress?: (message: string) => void;
}

const MIN_TEXT_CHARS = 45;

function usefulText(text: string, language: 'bn' | 'en'): boolean {
  const clean = text.trim();
  if (clean.length < MIN_TEXT_CHARS) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  if (new Set(words).size < 5) return false;
  if (language === 'bn') {
    const letters = clean.replace(/[^\p{L}]/gu, '');
    if (!letters) return false;
    const bengali = letters.match(/[\u0980-\u09FF]/g)?.length ?? 0;
    if (bengali / letters.length < 0.18) return false;
  }
  return true;
}

/**
 * Rendered pages are cached next to OCR results. Rendering is the slowest part
 * of a reindex, so this keeps routine re-chunking fast and fully offline.
 */
async function renderPageCached(
  pdf: Awaited<ReturnType<typeof openPdf>>,
  pageIndex: number,
  scale: number,
  cacheKey: string
): Promise<Buffer> {
  const folder = path.join(env.ocr.cacheRoot, cacheKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120), 'pages');
  const file = path.join(folder, `s${scale}-p${String(pageIndex + 1).padStart(4, '0')}.png`);
  try {
    return await fs.promises.readFile(file);
  } catch {
    /* not cached yet */
  }
  const png = await pdf.renderPage(pageIndex, scale);
  try {
    await fs.promises.mkdir(folder, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, png);
    await fs.promises.rename(temp, file);
  } catch (error) {
    log.warn('Could not cache rendered page', { message: (error as Error).message });
  }
  return png;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
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
    const maxBytes = env.tutor.uploadMaxMb * 1024 * 1024;
    if (file.size > maxBytes) throw Object.assign(new Error(`PDF exceeds the ${env.tutor.uploadMaxMb}MB limit`), { statusCode: 400 });

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
      ocrLanguage: input.language === 'en' ? 'en' : 'bn',
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
    // Background processing, do not block the HTTP response.
    setImmediate(() => {
      void this.processJob(String(job._id)).catch((error) => log.error('Book ingestion failed', { message: (error as Error).message }));
    });
    return { book, jobId: String(job._id) };
  },

  async processJob(jobId: string, options: IngestOptions = {}): Promise<void> {
    const job = await IngestionJobModel.findById(jobId);
    if (!job) return;
    const book = await BookModel.findById(job.bookId);
    if (!book) {
      await IngestionJobModel.updateOne({ _id: job._id }, { $set: { state: 'failed', errorMessage: 'Book not found' } });
      return;
    }

    if (!options.force && book.processingState === 'ready' && book.chunkCount > 0) {
      await IngestionJobModel.updateOne(
        { _id: job._id },
        { $set: { state: 'done', progress: 100, finishedAt: new Date(), warnings: ['Book is already ready; use force to re-index.'] } }
      );
      return;
    }

    if (options.ocrProvider || options.ocrModel || options.ocrConcurrency) {
      setOcrConfig({
        ...(options.ocrProvider ? { provider: options.ocrProvider } : {}),
        ...(options.ocrModel ? { visionModel: options.ocrModel } : {}),
        ...(options.ocrConcurrency ? { concurrency: options.ocrConcurrency } : {}),
      });
    }
    const ocrConfig = getOcrConfig();
    const language: 'bn' | 'en' =
      (book as { ocrLanguage?: string }).ocrLanguage === 'en' ||
      ((book as { ocrLanguage?: string }).ocrLanguage === undefined && book.language === 'en')
        ? 'en'
        : 'bn';
    const scale = Math.max(1.5, Math.min(4, options.ocrScale ?? env.ocr.scale));

    await IngestionJobModel.updateOne({ _id: job._id }, { $set: { state: 'processing', startedAt: new Date(), attempt: job.attempt + 1 } });
    await BookModel.updateOne({ _id: book._id }, { $set: { processingState: 'processing', processingProgress: 12, processingError: '' } });

    try {
      const { getDb } = await import('../../config/db');
      const db = getDb();
      if (!db) throw new Error('Database is not connected');
      const bucket = new (require('mongoose').mongo.GridFSBucket)(db, { bucketName: 'uploads' });
      const objectId = safeObjectId(String(book.fileId));
      if (!objectId) throw new Error('Stored book file is missing');
      const buffer: Buffer = await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        bucket
          .openDownloadStream(objectId)
          .on('data', (data: Buffer) => chunks.push(data))
          .on('error', reject)
          .on('end', () => resolve(Buffer.concat(chunks)));
      });

      const pdf = await openPdf(buffer);
      const totalPages = Math.min(pdf.pageCount, options.maxPages ?? pdf.pageCount);
      const warnings: string[] = [];
      const pages: PageText[] = [];
      let textPages = 0;
      let ocrPages = 0;
      let visionPages = 0;
      let emptyPages = 0;
      let visionCost = 0;
      let processed = 0;

      const cacheKey = book.checksum || String(book._id);
      const batchSize = Math.max(2, ocrConfig.concurrency * 2);

      try {
        for (let start = 0; start < totalPages; start += batchSize) {
          const end = Math.min(start + batchSize, totalPages);
          const batch: Array<{
            index: number;
            text: string;
            png?: Buffer;
            source: 'text' | 'ocr';
          }> = [];

          // PDF parsing stays sequential; OCR calls run in parallel below.
          for (let index = start; index < end; index += 1) {
            const extracted = normalizeText(await pdf.extractText(index));
            if (usefulText(extracted, language)) {
              batch.push({ index, text: extracted, source: 'text' });
            } else {
              const png = await renderPageCached(pdf, index, scale, cacheKey);
              batch.push({ index, text: extracted, png, source: 'ocr' });
            }
          }

          const ocrTargets = batch.filter((item) => item.png);
          const ocrResults = await mapLimit(ocrTargets, ocrConfig.concurrency, async (item) => {
            const result = await ocrPage(item.png as Buffer, {
              bookTitle: book.title,
              language,
              pageIndex: item.index,
              cacheKey,
              scale,
            });
            if (result.visionUsage?.cost) visionCost += result.visionUsage.cost;
            if (result.provider === 'vision') visionPages += 1;
            return { index: item.index, result };
          });
          const byIndex = new Map(ocrResults.map((entry) => [entry.index, entry.result]));

          for (const item of batch) {
            if (item.png) {
              const result = byIndex.get(item.index);
              const text = normalizeText(result?.text || item.text || '');
              if (text) {
                ocrPages += 1;
                pages.push({
                  pageIndex: item.index,
                  pageLabel: String(item.index + 1),
                  text,
                  source: 'ocr',
                  confidence: result?.confidence,
                });
              } else {
                emptyPages += 1;
                warnings.push(`Page ${item.index + 1}: OCR produced no readable text.`);
              }
              for (const warning of result?.warnings ?? []) {
                if (warnings.length < 20) warnings.push(`Page ${item.index + 1}: ${warning}`);
              }
            } else {
              textPages += 1;
              pages.push({
                pageIndex: item.index,
                pageLabel: String(item.index + 1),
                text: item.text,
                source: 'text',
              });
            }
          }

          processed = end;
          const progress = 15 + Math.round((processed / Math.max(1, totalPages)) * 68);
          await BookModel.updateOne({ _id: book._id }, { $set: { processingProgress: progress, pageCount: pdf.pageCount } });
          await IngestionJobModel.updateOne({ _id: job._id }, { $set: { progress } });
          options.onProgress?.(
            `Parsed ${processed}/${totalPages} pages (text ${textPages}, OCR ${ocrPages}, empty ${emptyPages})`
          );
        }
      } finally {
        await pdf.close();
      }

      const cleaned = cleanPageTexts(pages);
      const chaptered = detectChapters(cleaned, stableChapterId);
      const chunkInputs = chunkBookPages(chaptered);

      if (!chunkInputs.length) {
        const message = 'No readable text was found in this PDF. Try a clearer scan or check the OCR settings.';
        await BookModel.updateOne(
          { _id: book._id },
          {
            $set: {
              processingState: 'failed',
              processingProgress: 100,
              processingError: message,
              pageCount: pdf.pageCount,
              ocrPageCount: ocrPages,
              textPageCount: textPages,
              ocrModel: visionPages ? ocrConfig.visionModel : ocrPages ? 'tesseract' : '',
              ocrLanguage: language,
              ocrScale: scale,
              ingestedAt: new Date(),
            },
          }
        );
        await IngestionJobModel.updateOne(
          { _id: job._id },
          { $set: { state: 'failed', progress: 100, finishedAt: new Date(), errorMessage: message, warnings } }
        );
        return;
      }

      const docs = chunkInputs.map((chunk, index) => {
        const chapterTitle = chunk.chapterTitle || '';
        return {
          bookId: book._id,
          bookTitle: book.title,
          subject: book.subject,
          grade: book.grade,
          curriculum: book.curriculum,
          language: book.language,
          edition: book.edition,
          bookVersion: book.version,
          chapterId: chunk.chapterId || null,
          chapterTitle,
          chapterOrder: chunk.chapterOrder || 0,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          pageType: chunk.pageType || 'content',
          source: chunk.source || 'text',
          ocrModel: visionPages ? ocrConfig.visionModel : ocrPages ? 'tesseract' : '',
          ocrScale: ocrPages ? scale : 0,
          chunkIndex: index,
          text: chunk.text,
          normalizedText: normalizeForIndex(chunk.text),
          searchTerms: chunkSearchTerms(chunk.text, chapterTitle),
          preview: buildPreview(chunk.text, 240),
          hash: crypto.createHash('sha256').update(chunk.text).digest('hex'),
          embeddingModel: EMBEDDING_MODEL,
          embeddingVersion: EMBEDDING_VERSION,
        };
      });

      await BookChunkModel.deleteMany({ bookId: book._id });
      for (let index = 0; index < docs.length; index += 250) {
        await BookChunkModel.insertMany(docs.slice(index, index + 250), { ordered: false });
      }

      const chunkCount = docs.length;
      await BookModel.updateOne(
        { _id: book._id },
        {
          $set: {
            chunkCount,
            pageCount: pdf.pageCount,
            processingState: 'ready',
            processingProgress: 100,
            processingError: '',
            ocrPageCount: ocrPages,
            textPageCount: textPages,
            ocrModel: visionPages ? ocrConfig.visionModel : ocrPages ? 'tesseract' : '',
            ocrLanguage: language,
            ocrScale: ocrPages ? scale : 0,
            ingestedAt: new Date(),
          },
        }
      );
      if (options.publish !== false) {
        await BookModel.updateOne(
          { _id: book._id },
          { $set: { publicationState: 'published', publishedAt: new Date(), publishedBy: 'admin', reviewedBy: 'admin' } }
        );
      }
      await IngestionJobModel.updateOne(
        { _id: job._id },
        {
          $set: {
            state: 'done',
            progress: 100,
            finishedAt: new Date(),
            warnings: [
              ...warnings.slice(0, 20),
              `Pages: ${textPages} text, ${ocrPages} OCR (${visionPages} vision), ${emptyPages} empty.`,
              `Chunks: ${chunkCount}.`,
              visionCost ? `Vision OCR cost: $${visionCost.toFixed(4)}.` : '',
            ].filter(Boolean),
          },
        }
      );
      options.onProgress?.(
        `Done: ${chunkCount} chunks from ${pages.length} pages (${textPages} text, ${ocrPages} OCR, ${emptyPages} empty).`
      );
      log.info('Book ingestion finished', {
        bookId: String(book._id),
        chunkCount,
        textPages,
        ocrPages,
        visionPages,
        emptyPages,
        visionCost: Number(visionCost.toFixed(4)),
      });
    } catch (error) {
      const message = (error as Error).message;
      await BookModel.updateOne({ _id: book._id }, { $set: { processingState: 'failed', processingError: message.slice(0, 500) } });
      await IngestionJobModel.updateOne(
        { _id: job._id },
        { $set: { state: 'failed', finishedAt: new Date(), errorMessage: message.slice(0, 500), errorCode: 'EXTRACTION_FAILED' } }
      );
      throw error;
    }
  },

  async retryJob(bookId: string, options: IngestOptions = {}) {
    const book = await BookModel.findById(bookId);
    if (!book) throw Object.assign(new Error('Book not found'), { statusCode: 404 });
    const job = await IngestionJobModel.create({
      bookId: book._id,
      kind: book.chunkCount ? 'reindex' : 'ingest',
      state: 'queued',
      progress: 0,
    });
    await BookModel.updateOne({ _id: book._id }, { $set: { processingState: 'processing', processingError: '' } });
    setImmediate(() => {
      void this.processJob(String(job._id), options).catch((error) => log.error('Book retry failed', { message: (error as Error).message }));
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

  /** Text-only extraction helper used by tests and diagnostics. */
  extractTextPages: extractPdfPages,
  isTableOfContents,
};

export default bookIngestionService;
