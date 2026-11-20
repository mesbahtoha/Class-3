import crypto from 'crypto';
import mongoose from 'mongoose';
import { BookModel } from '../../database/models/Book.model';
import { BookChunkModel } from '../../database/models/BookChunk.model';
import { ChapterRef } from './types';
import { PracticeError } from './types';

/** Stable, deterministic chapter id when BookChunk rows carry no chapterId. */
export function stableChapterId(title: string, order: number): string {
  const hash = crypto
    .createHash('sha1')
    .update(`${title}|${order}`)
    .digest('hex')
    .slice(0, 12);
  return `ch_${hash}`;
}

/**
 * Chapters that belong to a book, aggregated from the ingested BookChunk
 * rows. Falls back to a generic "General" chapter when nothing was ingested.
 */
export async function listChaptersForBook(bookId: string): Promise<ChapterRef[]> {
  const book = await BookModel.findById(bookId).lean();
  if (!book) {
    throw new PracticeError(404, 'Book not found');
  }

  const bookIdObj = new mongoose.Types.ObjectId(String(book._id));
  const rows: Array<Record<string, unknown>> = await BookChunkModel.aggregate([
    { $match: { bookId: bookIdObj } },
    {
      $group: {
        _id: {
          chapterId: '$chapterId',
          chapterTitle: '$chapterTitle',
          chapterOrder: '$chapterOrder',
        },
        chunkCount: { $sum: 1 },
        firstPage: { $min: '$pageStart' },
        lastPage: { $max: '$pageEnd' },
      },
    },
  ]);

  const chapters: ChapterRef[] = rows
    .map((row) => {
      const key = row._id as Record<string, unknown>;
      const title = String(key.chapterTitle ?? '') || 'General';
      const order = Number(key.chapterOrder ?? 0) || 0;
      const chapterId = key.chapterId ? String(key.chapterId) : stableChapterId(title, order);
      return {
        id: chapterId,
        title,
        order,
        chunkCount: Number(row.chunkCount ?? 0),
        firstPage: (row.firstPage as number) ?? null,
        lastPage: (row.lastPage as number) ?? null,
      };
    })
    .filter((chapter) => chapter.title.trim().length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map(({ id, title, order }) => ({ id, title, order }));

  if (chapters.length === 0) {
    return [{ id: 'general', title: 'General', order: 0 }];
  }

  return chapters;
}
