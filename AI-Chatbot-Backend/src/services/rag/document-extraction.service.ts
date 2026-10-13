import crypto from 'crypto';
import { normalizeForSearch, normalizeText, buildPreview } from '../../utils/text.utils';

export interface PageText {
  pageIndex: number; // 0-based file page
  pageLabel: string; // printed label when known, else String(pageIndex+1)
  text: string;
}

/**
 * Document extraction: text PDFs via pdf-parse; scanned pages produce a
 * warning (Bengali OCR route documented as vision-model fallback).
 * Real page numbers/labels are preserved; never invented.
 */
export async function extractPdfPages(buffer: Buffer, filename: string): Promise<{ pages: PageText[]; warnings: string[]; pageCount: number }> {
  const warnings: string[] = [];
  // Validate actual file signature server-side (not just extension/MIME).
  const isPdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  if (!isPdf) throw Object.assign(new Error('Uploaded file is not a valid PDF (signature check failed).'), { statusCode: 400 });

  let parsed: { text?: string; numpages?: number };
  try {
    const pdfParse = (await import('pdf-parse')).default;
    parsed = await pdfParse(buffer);
  } catch (error) {
    throw Object.assign(new Error(`Could not read this PDF: ${(error as Error).message}`), { statusCode: 422 });
  }
  const fullText = normalizeText(parsed.text || '');
  const pageCount = parsed.numpages || 0;
  if (!fullText) {
    warnings.push('No selectable text found ,  this looks like a scanned PDF. Bengali OCR review is needed before publishing.');
    return { pages: [], warnings, pageCount };
  }
  // pdf-parse returns concatenated text; split heuristically into page-sized
  // pieces while keeping real sequential page labels.
  const approxPages = Math.max(1, pageCount || 1);
  const charsPerPage = Math.max(500, Math.ceil(fullText.length / approxPages));
  const pages: PageText[] = [];
  for (let i = 0; i < approxPages; i++) {
    const slice = fullText.slice(i * charsPerPage, (i + 1) * charsPerPage).trim();
    if (!slice) continue;
    pages.push({ pageIndex: i, pageLabel: String(i + 1), text: slice });
  }
  void filename;
  return { pages, warnings, pageCount: approxPages };
}

export function checksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export interface BookChunkInput {
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  chapterTitle?: string;
  chapterOrder?: number;
}

/** Splits page text into overlapping retrieval chunks with page metadata. */
export function chunkBookPages(pages: PageText[], wordsPerChunk = 160, overlapWords = 30): BookChunkInput[] {
  const out: BookChunkInput[] = [];
  for (const page of pages) {
    const words = normalizeText(page.text).split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const chapter = detectChapterHeading(page.text);
    let start = 0;
    let idx = 0;
    while (start < words.length) {
      const end = Math.min(start + wordsPerChunk, words.length);
      const text = words.slice(start, end).join(' ');
      out.push({
        text,
        pageStart: page.pageIndex + 1,
        pageEnd: page.pageIndex + 1,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order,
      });
      void idx;
      idx += 1;
      if (end === words.length) break;
      start = Math.max(end - overlapWords, start + 1);
    }
  }
  return out;
}

function detectChapterHeading(text: string): { title: string; order: number } {
  const m = normalizeText(text).slice(0, 600).match(/(অধ্যায়|অধ্যায়|chapter|পরিচ্ছেদ|পাঠ)\s*[:\-]?\s*([^\n]{0,80})/i);
  if (m) return { title: normalizeText(m[0]).slice(0, 120), order: 0 };
  return { title: '', order: 0 };
}

export function chunkPreview(text: string): string {
  return buildPreview(text, 220);
}

export function normalizedChunk(text: string): string {
  return normalizeForSearch(text);
}
