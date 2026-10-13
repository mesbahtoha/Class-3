import { BookChunkModel } from '../../database/models/BookChunk.model';
import { computeKeywordScore, normalizeText } from '../../utils/text.utils';
import { retrievalQueryForms } from '../ai/banglish-normalizer.service';
import { EMBEDDING_MODEL, EMBEDDING_VERSION } from './embedding.service';

export interface BookFilter {
  bookId?: string;
  subject?: string;
  grade?: string;
  curriculum?: string;
  language?: string;
}

export interface RetrievedBookChunk {
  chunkId: string;
  bookId: string;
  bookTitle: string;
  subject: string;
  chapterId?: string;
  chapterTitle?: string;
  pageStart?: number;
  pageEnd?: number;
  text: string;
  score: number;
}

export const RETRIEVAL_LIMIT = 6;
export const RETRIEVAL_MIN_SCORE = 4;

/**
 * Textbook retrieval over PUBLISHED books only.
 * Multi-strategy: original query + Banglish/Bengali variants, semantic
 * (keyword-overlap, multilingual-safe) + lexical regex prefilter, dedup + rank.
 */
export async function retrieveBookChunks(question: string, filter: BookFilter = {}, limit = RETRIEVAL_LIMIT): Promise<RetrievedBookChunk[]> {
  const forms = retrievalQueryForms(question);
  const match: Record<string, unknown> = {
    embeddingModel: EMBEDDING_MODEL,
    embeddingVersion: EMBEDDING_VERSION,
  };
  // Only chunks whose book is published are eligible. book_chunks denormalize
  // publication via book query below (join-free: filter by bookIds first).
  const { BookModel } = await import('../../database/models/Book.model');
  const bookFilter: Record<string, unknown> = { publicationState: 'published' };
  if (filter.bookId) bookFilter._id = filter.bookId;
  if (filter.subject) bookFilter.subject = filter.subject;
  if (filter.grade) bookFilter.grade = filter.grade;
  if (filter.curriculum) bookFilter.curriculum = filter.curriculum;
  if (filter.language) bookFilter.language = filter.language;
  const books = await BookModel.find(bookFilter).select('_id').lean();
  if (!books.length) return [];
  const bookIds = books.map((b) => b._id);
  match.bookId = { $in: bookIds };

  const scored = new Map<string, RetrievedBookChunk>();
  for (const form of forms) {
    const clean = normalizeText(form);
    if (!clean) continue;
    const tokens = clean.split(/\s+/).filter((t) => t.length > 1).slice(0, 12);
    if (!tokens.length) continue;
    const orClauses = tokens.slice(0, 8).map((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return { text: { $regex: escaped, $options: 'i' } };
    });
    const candidates = await BookChunkModel.find({ ...match, $or: orClauses })
      .limit(limit * 10)
      .lean();
    for (const c of candidates) {
      const key = String(c._id);
      const score =
        computeKeywordScore(c.bookTitle || '', question) * 0.5 +
        computeKeywordScore(c.chapterTitle || '', question) * 1.2 +
        computeKeywordScore(c.text || '', question) * 1.0 +
        computeKeywordScore(c.text || '', form) * 0.6;
      const prev = scored.get(key);
      const entry: RetrievedBookChunk = {
        chunkId: key,
        bookId: String(c.bookId),
        bookTitle: c.bookTitle || '',
        subject: (c as { subject?: string }).subject || '',
        chapterTitle: (c as { chapterTitle?: string }).chapterTitle || undefined,
        pageStart: (c as { pageStart?: number }).pageStart ?? undefined,
        pageEnd: (c as { pageEnd?: number }).pageEnd ?? undefined,
        text: (c as { text?: string }).text || '',
        score,
      };
      if (!prev || score > prev.score) scored.set(key, entry);
    }
  }
  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.score >= RETRIEVAL_MIN_SCORE)
    .slice(0, limit);
}

export function retrievalSufficient(chunks: RetrievedBookChunk[]): boolean {
  if (!chunks.length) return false;
  return (chunks[0]?.score ?? 0) >= RETRIEVAL_MIN_SCORE;
}
