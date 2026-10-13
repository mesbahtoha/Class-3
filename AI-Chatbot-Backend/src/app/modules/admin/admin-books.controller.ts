import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, fail } from '../../../utils/response.utils';
import { BookModel } from '../../../database/models/Book.model';
import { BookChunkModel } from '../../../database/models/BookChunk.model';
import { IngestionJobModel } from '../../../database/models/IngestionJob.model';
import bookIngestionService from '../../../services/rag/book-ingestion.service';
import { normalizeText } from '../../../utils/text.utils';

export const createBookSchema = z.object({
  title: z.string().min(1).max(300),
  subject: z.string().min(1).max(100),
  grade: z.string().max(50).optional(),
  curriculum: z.string().max(50).optional(),
  language: z.string().max(20).optional(),
  edition: z.string().max(100).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  publisher: z.string().max(200).optional(),
  sourceNotes: z.string().max(2000).optional(),
  rightsStatus: z.string().max(50).optional(),
});

export const updateBookSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  subject: z.string().min(1).max(100).optional(),
  grade: z.string().max(50).optional(),
  curriculum: z.string().max(50).optional(),
  language: z.string().max(20).optional(),
  edition: z.string().max(100).optional(),
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  publisher: z.string().max(200).optional(),
  sourceNotes: z.string().max(2000).optional(),
  rightsStatus: z.string().max(50).optional(),
  reviewedBy: z.string().max(100).optional(),
});

function bookPayload(b: Record<string, unknown>) {
  return {
    _id: b._id,
    title: b.title,
    subject: b.subject,
    grade: b.grade,
    curriculum: b.curriculum,
    language: b.language,
    edition: b.edition,
    year: b.year,
    publisher: b.publisher,
    sourceNotes: b.sourceNotes,
    rightsStatus: b.rightsStatus,
    fileSize: b.fileSize,
    checksum: b.checksum,
    pageCount: b.pageCount,
    processingState: b.processingState,
    processingError: b.processingError,
    processingProgress: b.processingProgress,
    publicationState: b.publicationState,
    chunkCount: b.chunkCount,
    version: b.version,
    publishedAt: b.publishedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export const adminBooksController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { search, subject, publicationState } = req.query as Record<string, string>;
    const q: Record<string, unknown> = {};
    if (subject) q.subject = subject;
    if (publicationState) q.publicationState = publicationState;
    if (search) q.title = { $regex: search, $options: 'i' };
    const books = await BookModel.find(q).sort({ updatedAt: -1 }).limit(200).lean();
    ok(res, { books: books.map((b) => bookPayload(b as unknown as Record<string, unknown>)) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const book = await BookModel.findById(req.params.id).lean();
    if (!book) return fail(res, 404, 'Book not found');
    const jobs = await IngestionJobModel.find({ bookId: book._id }).sort({ createdAt: -1 }).limit(5).lean();
    const samples = await BookChunkModel.find({ bookId: book._id }).sort({ chunkIndex: 1 }).limit(8).lean();
    ok(res, {
      book: bookPayload(book as unknown as Record<string, unknown>),
      jobs: jobs.map((j) => ({
        _id: j._id,
        kind: j.kind,
        state: j.state,
        progress: j.progress,
        errorCode: j.errorCode,
        errorMessage: j.errorMessage,
        warnings: j.warnings,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
      })),
      samples: samples.map((c) => ({
        chunkId: String(c._id),
        chunkIndex: c.chunkIndex,
        chapterTitle: c.chapterTitle,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        preview: c.preview,
      })),
    });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) return fail(res, 400, 'A PDF file is required (field name "file")');
    const { book, jobId } = await bookIngestionService.createBook({
      title: String(req.body.title || ''),
      subject: String(req.body.subject || ''),
      grade: req.body.grade,
      curriculum: req.body.curriculum,
      language: req.body.language,
      edition: req.body.edition,
      year: req.body.year ? Number(req.body.year) : undefined,
      publisher: req.body.publisher,
      sourceNotes: req.body.sourceNotes,
      rightsStatus: req.body.rightsStatus,
      uploadedBy: req.user?.email || 'admin',
      file: req.file,
    });
    res.status(201).json({ success: true, message: 'Book uploaded. Processing in background.', book: bookPayload(book.toObject()), jobId, requestId: req.requestId });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const book = await BookModel.findById(req.params.id);
    if (!book) return fail(res, 404, 'Book not found');
    const allowed = ['title', 'subject', 'grade', 'curriculum', 'language', 'edition', 'year', 'publisher', 'sourceNotes', 'rightsStatus', 'reviewedBy'] as const;
    for (const key of allowed) {
      if (req.body[key] !== undefined) (book as unknown as Record<string, unknown>)[key] = typeof req.body[key] === 'string' ? normalizeText(req.body[key]) : req.body[key];
    }
    await book.save();
    // Keep chunk denormalized metadata in sync for edited fields.
    await BookChunkModel.updateMany(
      { bookId: book._id },
      { $set: { bookTitle: book.title, subject: book.subject, grade: book.grade, curriculum: book.curriculum, language: book.language, edition: book.edition } }
    );
    ok(res, { book: bookPayload(book.toObject()) });
  }),

  publish: asyncHandler(async (req: Request, res: Response) => {
    const book = await BookModel.findById(req.params.id);
    if (!book) return fail(res, 404, 'Book not found');
    if (book.processingState !== 'ready' || book.chunkCount === 0) {
      return fail(res, 409, 'Book is not ready: processing must succeed with at least 1 chunk before publishing.');
    }
    book.publicationState = 'published';
    book.publishedBy = req.user?.email || 'admin';
    book.publishedAt = new Date();
    await book.save();
    ok(res, { book: bookPayload(book.toObject()) });
  }),

  unpublish: asyncHandler(async (req: Request, res: Response) => {
    const book = await BookModel.findById(req.params.id);
    if (!book) return fail(res, 404, 'Book not found');
    // Unpublish immediately excludes content from retrieval (query filters published only).
    book.publicationState = 'draft';
    await book.save();
    ok(res, { book: bookPayload(book.toObject()) });
  }),

  reindex: asyncHandler(async (req: Request, res: Response) => {
    const job = await bookIngestionService.retryJob(req.params.id);
    ok(res, { message: 'Re-index queued', jobId: String(job._id), state: job.state });
  }),

  archive: asyncHandler(async (req: Request, res: Response) => {
    const book = await BookModel.findById(req.params.id);
    if (!book) return fail(res, 404, 'Book not found');
    book.publicationState = 'archived';
    await book.save();
    ok(res, { book: bookPayload(book.toObject()) });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const book = await BookModel.findById(req.params.id);
    if (!book) return fail(res, 404, 'Book not found');
    await bookIngestionService.deleteBook(String(book._id));
    ok(res, { message: 'Book archived and deleted with its chunks' });
  }),
};

export default adminBooksController;
