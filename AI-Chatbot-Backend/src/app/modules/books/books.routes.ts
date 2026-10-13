import { Router } from 'express';
import { asyncHandler, ok, fail } from '../../../utils/response.utils';
import bookRepository from '../../../repositories/book.repository';
import { BookModel } from '../../../database/models/Book.model';

const router = Router();

/**
 * Public textbook catalogue (published books only).
 * GET /api/v1/books?subject=&grade=&curriculum=&search=
 * GET /api/v1/books/:id (info + sample chunks, no raw file bytes)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { subject, grade, curriculum, search } = req.query as Record<string, string>;
    const books = await bookRepository.listPublished({ subject, grade, curriculum, search });
    ok(res, {
      books: books.map((b) => ({
        _id: b._id,
        title: b.title,
        subject: b.subject,
        grade: b.grade,
        curriculum: b.curriculum,
        language: b.language,
        edition: b.edition,
        publisher: b.publisher,
        chunkCount: b.chunkCount,
        pageCount: b.pageCount,
        updatedAt: b.updatedAt,
      })),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const book = await bookRepository.findPublishedById(req.params.id);
    if (!book) return fail(res, 404, 'Book not found');
    const chunks = await bookRepository.previewChunks(String(book._id), 6);
    ok(res, {
      book: {
        _id: book._id,
        title: book.title,
        subject: book.subject,
        grade: book.grade,
        curriculum: book.curriculum,
        language: book.language,
        edition: book.edition,
        publisher: book.publisher,
        chunkCount: book.chunkCount,
        pageCount: book.pageCount,
      },
      samples: chunks.map((c) => ({
        chunkId: String(c._id),
        chapterTitle: c.chapterTitle,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        preview: c.preview,
      })),
    });
  })
);

router.get(
  '/meta/subjects',
  asyncHandler(async (_req, res) => {
    const subjects = await BookModel.distinct('subject', { publicationState: 'published' });
    ok(res, { subjects });
  })
);

export default router;
