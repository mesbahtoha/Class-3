import mongoose from 'mongoose';
import { BookChunkModel } from '../../database/models/BookChunk.model';
import { BookModel } from '../../database/models/Book.model';
import {
  bm25Score,
  buildQueryTerms,
  chunkSearchTerms,
  contentTokens,
  escapeRegex,
  matchStats,
  normalizeForIndex,
  type QueryTerm,
} from '../../utils/text.utils';
import { retrievalQueryForms } from '../ai/banglish-normalizer.service';

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
  subject?: string;
  chapterId?: string;
  chapterTitle?: string;
  pageStart?: number;
  pageEnd?: number;
  text: string;
  preview: string;
  score: number;
  matchedOriginal: number;
  matchedTotal: number;
  coverage: number;
  queryOriginalCount: number;
}

export const RETRIEVAL_LIMIT = 8;
export const RETRIEVAL_MIN_SCORE = 1.1;
const CANDIDATE_LIMIT = 700;
const MAX_FALLBACK_CHUNKS = 2500;

interface ChunkRow {
  _id: unknown;
  bookId: unknown;
  bookTitle?: string;
  subject?: string;
  chapterId?: string | null;
  chapterTitle?: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  text?: string;
  preview?: string;
  searchTerms?: string[];
}

function textSimilarity(a: string, b: string): number {
  const left = new Set(contentTokens(a).slice(0, 120));
  const right = new Set(contentTokens(b).slice(0, 120));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function rowToChunk(
  row: ChunkRow,
  score: number,
  stats: ReturnType<typeof matchStats>,
  queryOriginalCount: number
): RetrievedBookChunk {
  return {
    chunkId: String(row._id),
    bookId: String(row.bookId),
    bookTitle: row.bookTitle || '',
    subject: row.subject || '',
    chapterId: row.chapterId ?? undefined,
    chapterTitle: row.chapterTitle || undefined,
    pageStart: row.pageStart ?? undefined,
    pageEnd: row.pageEnd ?? undefined,
    text: row.text || '',
    preview: row.preview || (row.text || '').slice(0, 240),
    score,
    matchedOriginal: stats.matchedOriginal,
    matchedTotal: stats.matchedTotal,
    coverage: stats.coverage,
    queryOriginalCount,
  };
}

async function findCandidates(
  bookIds: mongoose.Types.ObjectId[],
  queryTerms: QueryTerm[],
  question: string
): Promise<ChunkRow[]> {
  const base = {
    bookId: { $in: bookIds },
    pageType: { $nin: ['toc', 'noise'] },
  };
  const terms = queryTerms.map((term) => term.term).filter(Boolean);
  let candidates: ChunkRow[] = [];

  if (terms.length) {
    candidates = (await BookChunkModel.find({ ...base, searchTerms: { $in: terms } })
      .limit(CANDIDATE_LIMIT)
      .lean()) as unknown as ChunkRow[];
  }

  // Older chunks may not have searchTerms yet. Fall back to a regex scan so
  // retrieval never silently loses a book that has not been re-indexed.
  if (candidates.length < 24) {
    const regexTerms = queryTerms
      .filter((term) => term.original)
      .slice(0, 10)
      .map((term) => term.term)
      .concat(
        normalizeForIndex(question)
          .split(/\s+/)
          .filter((token) => token.length >= 3)
          .slice(0, 4)
      )
      .filter(Boolean);
    if (regexTerms.length) {
      const or = regexTerms.map((term) => ({
        $or: [
          { normalizedText: { $regex: escapeRegex(term), $options: 'i' } },
          { chapterTitle: { $regex: escapeRegex(term), $options: 'i' } },
        ],
      }));
      const regexRows = (await BookChunkModel.find({ ...base, $or: or.flatMap((entry) => entry.$or) })
        .limit(CANDIDATE_LIMIT)
        .lean()) as unknown as ChunkRow[];
      const seen = new Set(candidates.map((row) => String(row._id)));
      for (const row of regexRows) {
        if (!seen.has(String(row._id))) {
          candidates.push(row);
          seen.add(String(row._id));
        }
      }
    }
  }

  if (candidates.length < 12) {
    const all = (await BookChunkModel.find(base).limit(MAX_FALLBACK_CHUNKS).lean()) as unknown as ChunkRow[];
    const seen = new Set(candidates.map((row) => String(row._id)));
    for (const row of all) {
      if (!seen.has(String(row._id))) {
        candidates.push(row);
        seen.add(String(row._id));
      }
    }
  }

  return candidates;
}

/**
 * Textbook retrieval over PUBLISHED books only.
 *
 * Hybrid lexical retrieval: indexed candidate lookup, cross-language topic
 * expansion, BM25 ranking, exact-phrase and chapter-heading bonuses, then
 * near-duplicate removal. No external embedding service is required, and the
 * same query works for Bengali, English and Banglish.
 */
export async function retrieveBookChunks(
  question: string,
  filter: BookFilter = {},
  limit = RETRIEVAL_LIMIT
): Promise<RetrievedBookChunk[]> {
  const forms = retrievalQueryForms(question);
  const queryTerms = buildQueryTerms(question, forms);
  if (!queryTerms.length) return [];

  const bookFilter: Record<string, unknown> = { publicationState: 'published' };
  if (filter.bookId) {
    if (!mongoose.isValidObjectId(filter.bookId)) return [];
    bookFilter._id = filter.bookId;
  }
  if (filter.subject) bookFilter.subject = filter.subject;
  if (filter.grade) bookFilter.grade = filter.grade;
  if (filter.curriculum) bookFilter.curriculum = filter.curriculum;
  if (filter.language) bookFilter.language = filter.language;

  const books = await BookModel.find(bookFilter).select('_id').lean();
  if (!books.length) return [];
  const bookIds = books.map((book) => book._id as mongoose.Types.ObjectId);

  const candidates = await findCandidates(bookIds, queryTerms, question);
  if (!candidates.length) return [];

  // Tokenize once and compute document frequency for BM25.
  const tokenized = candidates.map((row) => {
    const tokens = contentTokens(`${row.chapterTitle || ''} ${row.text || ''}`);
    return { row, tokens, tokenSet: new Set(tokens) };
  });
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;
  for (const entry of tokenized) {
    totalLength += entry.tokens.length;
    for (const token of entry.tokenSet) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const averageLength = totalLength / Math.max(1, tokenized.length);
  const originalCount = new Set(queryTerms.filter((term) => term.original).map((term) => term.term)).size;
  const phrase = normalizeForIndex(question);
  const usePhrase = phrase.length >= 4 && phrase.split(/\s+/).length <= 8;
  const originalTerms = queryTerms.filter((term) => term.original).map((term) => term.term);

  const scored = tokenized.map(({ row, tokens, tokenSet }) => {
    let score = bm25Score(tokens, queryTerms, documentFrequency, tokenized.length, averageLength);
    const stats = matchStats(tokenSet, queryTerms);

    const text = normalizeForIndex(row.text || '');
    const chapter = normalizeForIndex(row.chapterTitle || '');
    if (usePhrase && text.includes(phrase)) score += 7;
    let chapterHits = 0;
    for (const term of originalTerms) {
      if (chapter.includes(term)) chapterHits += 1;
    }
    score += Math.min(3.6, chapterHits * 1.2);
    if (originalTerms.some((term) => text.slice(0, 260).includes(term))) score += 0.8;

    return { row, score, stats };
  });

  const ranked = scored
    .filter((entry) => entry.stats.matchedTotal > 0 || entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: RetrievedBookChunk[] = [];
  for (const entry of ranked) {
    if (selected.length >= limit) break;
    if (entry.score < RETRIEVAL_MIN_SCORE) continue;
    if (entry.stats.matchedTotal === 0) continue;
    const duplicate = selected.some((chunk) => textSimilarity(chunk.text, entry.row.text || '') > 0.82);
    if (duplicate) continue;
    selected.push(rowToChunk(entry.row, entry.score, entry.stats, originalCount));
  }

  return selected;
}

/**
 * True when the retrieved text is strong enough to ground a book answer.
 * A synonym match (for example English "fraction" against Bengali "ভগ্নাংশ")
 * counts as evidence even when the exact original word is absent.
 */
export function retrievalSufficient(chunks: RetrievedBookChunk[]): boolean {
  if (!chunks.length) return false;
  const top = chunks[0];
  if (top.score < RETRIEVAL_MIN_SCORE || top.matchedTotal < 1) return false;
  if (top.coverage >= 0.3) return true;
  if (top.matchedTotal >= 2) return true;
  // A single content term is enough for short topic questions ("ভগ্নাংশ কী?").
  if (top.queryOriginalCount <= 3 && top.score >= 1.8) return true;
  return top.queryOriginalCount <= 1;
}

/** Exposed for diagnostics and tests. */
export function scoreChunksForTest(
  rows: Array<{ text: string; chapterTitle?: string; bookTitle?: string }>,
  question: string
): Array<{ index: number; score: number; matchedTotal: number }> {
  const queryTerms = buildQueryTerms(question, retrievalQueryForms(question));
  const tokenized = rows.map((row) => {
    const tokens = contentTokens(`${row.chapterTitle || ''} ${row.text}`);
    return { tokens, tokenSet: new Set(tokens) };
  });
  const df = new Map<string, number>();
  let total = 0;
  for (const entry of tokenized) {
    total += entry.tokens.length;
    for (const token of entry.tokenSet) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const avg = total / Math.max(1, tokenized.length);
  return tokenized
    .map((entry, index) => ({
      index,
      score: bm25Score(entry.tokens, queryTerms, df, tokenized.length, avg),
      matchedTotal: matchStats(entry.tokenSet, queryTerms).matchedTotal,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Legacy helper kept for callers that only need the stored search terms. */
export function chunkTerms(text: string, chapterTitle = ''): string[] {
  return chunkSearchTerms(text, chapterTitle);
}
