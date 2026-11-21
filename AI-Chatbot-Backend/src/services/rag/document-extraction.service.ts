import crypto from 'crypto';
import { buildPreview, normalizeForSearch, normalizeText, normalizeDigits } from '../../utils/text.utils';
import { openPdf } from './pdf-pages.service';

export interface PageText {
  pageIndex: number;
  pageLabel: string;
  text: string;
  source?: 'text' | 'ocr' | 'none';
  confidence?: number;
  pageType?: 'content' | 'toc' | 'front' | 'noise';
  chapterId?: string;
  chapterTitle?: string;
  chapterOrder?: number;
}

/** Text-layer extraction with real page boundaries (no OCR). */
export async function extractPdfPages(
  buffer: Buffer,
  filename: string
): Promise<{ pages: PageText[]; warnings: string[]; pageCount: number }> {
  const warnings: string[] = [];
  const pdf = await openPdf(buffer);
  const pages: PageText[] = [];
  try {
    for (let index = 0; index < pdf.pageCount; index += 1) {
      const text = normalizeText(await pdf.extractText(index));
      if (!text) continue;
      pages.push({ pageIndex: index, pageLabel: String(index + 1), text, source: 'text' });
    }
  } finally {
    await pdf.close();
  }
  if (!pages.length) {
    warnings.push('No selectable text found. This looks like a scanned PDF and needs OCR.');
  }
  void filename;
  return { pages, warnings, pageCount: pdf.pageCount };
}

export function checksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export interface BookChunkInput {
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  chapterId?: string;
  chapterTitle?: string;
  chapterOrder?: number;
  pageType?: 'content' | 'toc' | 'front' | 'noise';
  source?: 'text' | 'ocr' | 'none';
}

/**
 * Detects OCR/encoding output that must never be searched: model refusals,
 * repeated filename/logo loops, and legacy ANSI (Bijoy) mojibake.
 */
export function isLowQualityText(text: string): boolean {
  const clean = normalizeText(text);
  if (!clean) return true;
  if (/(the image contains|visual noise|unable to (read|extract|transcribe)|i cannot transcribe|no readable text)/i.test(clean)) {
    return true;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.length >= 20) {
    const counts = new Map<string, number>();
    for (const word of words) {
      const key = word.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [topWord, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const uniqueRatio = counts.size / words.length;
    // A long token repeated through most of a page is a filename/logo loop.
    // Short repeated numbers ("১০০০ ১০০০ ...") are legitimate math content.
    const letterLength = topWord.replace(/[^\p{L}]/gu, '').length;
    if (uniqueRatio < 0.22 && topCount / words.length >= 0.4 && letterLength >= 5) return true;
  }
  // Characters that essentially never occur in normal Bengali/English prose.
  const mojibake = (clean.match(/[†‡ˆ˜ŠšŒœŽžƒ]/g) ?? []).length;
  if (mojibake >= 3 || (mojibake >= 2 && mojibake / clean.length > 0.006)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Page cleanup                                                       */
/* ------------------------------------------------------------------ */

const HEADING_PATTERN =
  /^\s*(অধ্যায়|অধ্যায়|পাঠ|ইউনিট|পরিচ্ছেদ|প্রকরণ|শাখা|Chapter|Unit|Lesson|Part|Section)\s*[-–—:：]?\s*([0-9০-৯]+)(?:\s|[:.\-–—]|$)(.*)$/i;
const ORDINAL_HEADING_PATTERN =
  /^\s*(প্রথম|দ্বিতীয়|দ্বিতীয়|তৃতীয়|তৃতীয়|চতুর্থ|পঞ্চম|ষষ্ঠ|সপ্তম|অষ্টম|নবম|দশম)\s+(অধ্যায়|অধ্যায়|পাঠ|ইউনিট|পরিচ্ছেদ)(?:\s*[:：\-–—]?\s*(.*))?$/;

function isHeadingLine(line: string): boolean {
  return HEADING_PATTERN.test(line) || ORDINAL_HEADING_PATTERN.test(line);
}

export function isTableOfContents(text: string): boolean {
  const head = normalizeText(text).slice(0, 400);
  if (/(সূচিপত্র|সূচি|বিষয়সূচি|table of contents|contents)/i.test(head)) return true;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const dotted = lines.filter((line) => /\.{3,}\s*[0-9০-৯]{1,4}\s*$/.test(line)).length;
  return dotted >= 5;
}

/**
 * Removes running headers/footers and page numbers. Lines repeated on many
 * pages are furniture, not content. Chapter headings are never removed.
 */
export function cleanPageTexts(pages: PageText[]): PageText[] {
  if (!pages.length) return pages;
  const frequency = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const line of page.text.split('\n')) {
      const key = normalizeForSearch(line).replace(/\s+/g, ' ').trim();
      if (!key || key.length > 90 || seen.has(key)) continue;
      seen.add(key);
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.18));

  return pages.map((page) => {
    const lines = page.text.split('\n').map((line) => line.trim());
    const kept: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        kept.push('');
        continue;
      }
      const key = normalizeForSearch(line).replace(/\s+/g, ' ').trim();
      const repeated = (frequency.get(key) ?? 0) >= threshold && key.length <= 90;
      const pageNumber = /^[-–—\s]*[0-9০-৯]{1,4}[-–—\s]*$/.test(line) && (index === 0 || index === lines.length - 1);
      if ((repeated && !isHeadingLine(line)) || pageNumber) continue;
      kept.push(line);
    }
    return {
      ...page,
      text: normalizeText(kept.join('\n'))
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Chapter detection                                                  */
/* ------------------------------------------------------------------ */

export interface ChapterInfo {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
}

function parseOrder(value: string, fallback: number): number {
  const number = Number(normalizeDigits(value).replace(/[^0-9]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cleanHeading(line: string): string {
  return normalizeText(line)
    .replace(/\s+/g, ' ')
    .replace(/[।:：\-–—]+$/, '')
    .trim()
    .slice(0, 140);
}

function findHeading(page: PageText): { title: string; order: number } | null {
  const lines = page.text.split('\n').map((line) => line.trim()).filter(Boolean);
  const limit = Math.min(lines.length, 12);
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index];
    const numbered = line.match(HEADING_PATTERN);
    const ordinal = line.match(ORDINAL_HEADING_PATTERN);
    // Scanned headings sometimes carry a little decoration before the word
    // ("ক্যা: পাঠ৯"). Accept an embedded marker on a short line.
    const embedded =
      !numbered && !ordinal && line.length <= 60
        ? line.match(/(অধ্যায়|অধ্যায়|পাঠ|ইউনিট|Chapter|Unit|Lesson)\s*[-–—:：]?\s*([0-9০-৯]+)(?:\s|$)/i)
        : null;
    if (!numbered && !ordinal && !embedded) continue;

    const next = lines[index + 1];
    let title: string;
    if (embedded) {
      const after = line.slice((embedded.index ?? 0) + embedded[0].length).trim();
      const candidate = after && !/[।?!]$/.test(after) ? after : next || '';
      title = cleanHeading(candidate || line);
    } else {
      title = cleanHeading(line);
      if (next && next.length <= 80 && !isHeadingLine(next) && !/[।?!]$/.test(next)) {
        title = cleanHeading(`${title} ${next}`);
      }
    }
    const order = numbered || embedded ? parseOrder((numbered ?? embedded)![2], 0) : 0;
    return { title, order };
  }
  return null;
}

/** TOC titles are cleaner than OCR'd headings; use them for display when available. */
function tocTitlesByOrder(pages: PageText[]): Map<number, string> {
  const tocText = pages.filter((page) => isTableOfContents(page.text)).map((page) => page.text).join('\n');
  const titles = new Map<number, string>();
  for (const entry of parseTocEntries(tocText)) titles.set(entry.order, entry.title);
  return titles;
}

interface TocEntry {
  order: number;
  title: string;
  printedStart: number;
}

/** Parses clean table-of-contents lines into chapter entries. */
export function parseTocEntries(tocText: string): TocEntry[] {
  const lines = normalizeDigits(normalizeText(tocText))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: TocEntry[] = [];
  const seen = new Set<number>();

  for (const line of lines) {
    let order = 0;
    let title = '';
    let printedStart = 0;

    const withLabel = line.match(
      /^(?:অধ্যায়|অধ্যায়|পাঠ|Chapter|Unit|Lesson)\s*([0-9]{1,3})\s+(.+?)\s+([0-9]{1,3})(?:\s*[-–—]\s*[0-9]{1,3})?$/i
    );
    if (withLabel) {
      order = Number(withLabel[1]);
      title = withLabel[2];
      printedStart = Number(withLabel[3]);
    } else {
      const plain = line.match(/^([0-9]{1,3})\s+(.+?)\s+([0-9]{1,3})(?:\s*[-–—]\s*[0-9]{1,3})?$/);
      if (!plain) continue;
      order = Number(plain[1]);
      title = plain[2];
      printedStart = Number(plain[3]);
    }

    title = cleanHeading(title.replace(/[.।]+$/, ''));
    if (!title || title.length < 2 || title.length > 90) continue;
    if (/পৃষ্ঠা|শিরোনাম|বিষয়বস্তু|table of contents|contents/i.test(title)) continue;
    if (!Number.isFinite(order) || order < 1 || order > 200) continue;
    if (!Number.isFinite(printedStart) || printedStart < 1 || printedStart > 2000) continue;
    if (seen.has(order)) continue;
    seen.add(order);
    entries.push({ order, title, printedStart });
  }

  return entries.sort((a, b) => a.order - b.order);
}

/**
 * Builds a page -> chapter map from the printed table of contents. This is the
 * most reliable signal for scanned books, where chapter headings are often
 * printed as decorative artwork that OCR cannot read.
 */
function chaptersFromToc(
  pages: PageText[],
  chapterIdFor: (title: string, order: number) => string
): Array<ChapterInfo | null> | null {
  const tocIndexes = pages.map((page, index) => (isTableOfContents(page.text) ? index : -1)).filter((index) => index >= 0);
  if (!tocIndexes.length) return null;
  const tocText = tocIndexes.map((index) => pages[index].text).join('\n');
  const entries = parseTocEntries(tocText);
  if (entries.length < 2) return null;
  // A single misread page number makes chapter ranges overlap. Only trust a
  // TOC whose printed starts increase with chapter order.
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].printedStart <= entries[index - 1].printedStart) return null;
  }
  const tocEnd = Math.max(...tocIndexes);

  // Infer the offset between printed page numbers and PDF page indexes by
  // locating the first chapter title just after the table of contents.
  let offset = -1;
  for (const entry of entries.slice(0, 2)) {
    const needle = normalizeForSearch(entry.title);
    if (needle.length < 2) continue;
    const searchEnd = Math.min(pages.length, tocEnd + 40);
    for (let index = tocEnd + 1; index < searchEnd; index += 1) {
      const head = normalizeForSearch(pages[index].text.split('\n').slice(0, 8).join(' '));
      if (head.includes(needle)) {
        offset = index + 1 - entry.printedStart;
        break;
      }
    }
    if (offset >= 0) break;
  }
  if (offset < 0 || offset > 60) return null;

  const starts = entries
    .map((entry) => ({ entry, pageIndex: entry.printedStart + offset - 1 }))
    .filter((item) => item.pageIndex >= 0 && item.pageIndex < pages.length)
    .sort((a, b) => a.pageIndex - b.pageIndex);
  if (starts.length < 2) return null;

  let cursor = 0;
  return pages.map((page, index): ChapterInfo | null => {
    if (isTableOfContents(page.text) || isLowQualityText(page.text)) return null;
    while (cursor + 1 < starts.length && starts[cursor + 1].pageIndex <= index) cursor += 1;
    if (index < starts[0].pageIndex) return null;
    const entry = starts[cursor].entry;
    return {
      chapterId: chapterIdFor(entry.title, entry.order),
      chapterTitle: entry.title,
      chapterOrder: entry.order,
    };
  });
}

/**
 * Assigns a chapter to every page. A printed table of contents is preferred.
 * Otherwise headings are read only from the top of a page, so a chapter name
 * mentioned inside an exercise cannot switch chapters.
 */
export function detectChapters(pages: PageText[], chapterIdFor: (title: string, order: number) => string): PageText[] {
  const tocChapters = chaptersFromToc(pages, chapterIdFor);
  if (tocChapters) {
    return pages.map((page, index): PageText => {
      if (isTableOfContents(page.text)) {
        return { ...page, pageType: 'toc', chapterTitle: '', chapterOrder: 0 };
      }
      if (isLowQualityText(page.text)) {
        return { ...page, pageType: 'noise', chapterTitle: '', chapterOrder: 0 };
      }
      const info = tocChapters[index];
      if (!info) return { ...page, pageType: 'front', chapterTitle: '', chapterOrder: 0 };
      return { ...page, pageType: 'content', ...info };
    });
  }

  const tocTitles = tocTitlesByOrder(pages);
  let currentTitle = 'General';
  let currentOrder = 0;
  let currentId = chapterIdFor(currentTitle, currentOrder);
  let firstHeadingPage = -1;

  const result = pages.map((page, index): PageText => {
    if (isTableOfContents(page.text)) {
      return { ...page, pageType: 'toc' as const, chapterTitle: '', chapterOrder: 0 };
    }
    if (isLowQualityText(page.text)) {
      return { ...page, pageType: 'noise' as const, chapterTitle: '', chapterOrder: 0 };
    }
    const heading = findHeading(page);
    if (heading) {
      if (firstHeadingPage < 0) firstHeadingPage = index;
      const nextOrder = heading.order || currentOrder + 1;
      currentTitle = tocTitles.get(nextOrder) || heading.title;
      currentOrder = nextOrder;
      currentId = chapterIdFor(currentTitle, currentOrder);
    }
    return {
      ...page,
      pageType: 'content' as const,
      chapterId: currentId,
      chapterTitle: currentTitle,
      chapterOrder: currentOrder,
    };
  });

  // Pages before the first real chapter are cover/preface material.
  if (firstHeadingPage > 0) {
    for (let index = 0; index < firstHeadingPage; index += 1) {
      if (result[index].pageType !== 'toc') {
        result[index] = { ...result[index], pageType: 'front', chapterTitle: '', chapterOrder: 0 };
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Chunking                                                           */
/* ------------------------------------------------------------------ */

interface WordRef {
  word: string;
  page: number;
}

/**
 * Cover pages and decorative scans often OCR to symbol soup. Keep a front page
 * only when it contains a real paragraph in the book's script. Substantive
 * front matter (national flag, anthem, preface) must stay searchable.
 */
function frontPageUseful(page: PageText): boolean {
  const text = page.text.trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 25 || text.replace(/\s/g, '').length < 140) return false;
  if (/\b(combine|compressed|\.pdf)\b/i.test(text)) return false;
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return false;
  const bengali = letters.match(/[\u0980-\u09FF]/g)?.length ?? 0;
  return bengali / letters.length >= 0.45;
}

/**
 * Splits page text into overlapping, chapter-aware retrieval chunks. A chunk
 * never crosses a chapter boundary and keeps the real page range it came from.
 */
export function chunkBookPages(pages: PageText[], wordsPerChunk = 160, overlapWords = 30): BookChunkInput[] {
  const usable = pages.filter(
    (page) =>
      page.pageType !== 'toc' &&
      page.pageType !== 'noise' &&
      page.text.trim() &&
      (page.pageType !== 'front' || frontPageUseful(page))
  );
  if (!usable.length) return [];

  const out: BookChunkInput[] = [];
  let buffer: WordRef[] = [];
  let bufferChapter = '';
  let bufferSource: BookChunkInput['source'] = 'text';
  let bufferOrder = 0;
  let bufferTitle = '';

  const flush = () => {
    if (!buffer.length) return;
    const words = buffer.map((entry) => entry.word);
    const text = normalizeText(words.join(' '));
    if (text) {
      out.push({
        text,
        pageStart: buffer[0].page,
        pageEnd: buffer[buffer.length - 1].page,
        chapterId: bufferChapter || undefined,
        chapterTitle: bufferTitle || undefined,
        chapterOrder: bufferOrder || undefined,
        pageType: 'content',
        source: bufferSource,
      });
    }
    const overlap = overlapWords > 0 ? buffer.slice(-overlapWords) : [];
    buffer = overlap;
  };

  for (const page of usable) {
    const chapter = page.chapterId || '';
    if (buffer.length && chapter && chapter !== bufferChapter) {
      flush();
      // Never carry overlap text across a chapter boundary, including the
      // transition from front matter into the first chapter.
      buffer = [];
    }
    if (chapter) bufferChapter = chapter;
    if (page.chapterTitle) bufferTitle = page.chapterTitle;
    if (page.chapterOrder) bufferOrder = page.chapterOrder;
    if (page.source) bufferSource = page.source;

    const paragraphs = page.text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      for (const word of words) {
        buffer.push({ word, page: page.pageIndex + 1 });
        if (buffer.length >= wordsPerChunk) flush();
      }
      // A paragraph boundary is a natural place for the next chunk to start.
      if (buffer.length >= wordsPerChunk * 0.7) flush();
    }
  }

  if (buffer.length) {
    const last = out[out.length - 1];
    const text = normalizeText(buffer.map((entry) => entry.word).join(' '));
    if (last && buffer.length < Math.max(24, overlapWords) && last.pageEnd === buffer[buffer.length - 1].page) {
      last.text = normalizeText(`${last.text} ${text}`);
      last.pageEnd = buffer[buffer.length - 1].page;
    } else if (text) {
      out.push({
        text,
        pageStart: buffer[0].page,
        pageEnd: buffer[buffer.length - 1].page,
        chapterId: bufferChapter || undefined,
        chapterTitle: bufferTitle || undefined,
        chapterOrder: bufferOrder || undefined,
        pageType: 'content',
        source: bufferSource,
      });
    }
  }

  return out;
}

export function chunkPreview(text: string): string {
  return buildPreview(text, 220);
}

export function normalizedChunk(text: string): string {
  return normalizeForSearch(text);
}
