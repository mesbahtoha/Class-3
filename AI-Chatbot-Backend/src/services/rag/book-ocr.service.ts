import { deflateSync } from 'zlib';
import OpenRouterClient from '../openrouter.client';
import { normalizeText } from '../../utils/text.utils';
import { log } from '../../config/logger';
import type { PageText } from './document-extraction.service';

/*
 * Vision-model OCR for scanned (image-only) PDFs.
 *
 * pdf-parse's bundled pdfjs decodes scanned pages to raw pixel buffers
 * (no canvas needed in Node). We re-pack those pixels into PNG images,
 * send them to the configured vision model, and transcribe every page.
 * This is the documented Bengali OCR route ("vision-model fallback").
 */

const PDFJS_BUNDLE = 'pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js';
const PDFJS_OPS_PAINT_IMAGE = 85; // OPS.paintImageXObject in pdfjs 2.0.550

/** Only pages with at least this many pixels of image get OCR'd. */
const OCR_MIN_AREA = 10_000;
/** Cap of images per page, ranked by area, so pages with many fragments stay cheap. */
const OCR_MAX_PER_PAGE = 6;
/** Parallel OCR calls. */
const OCR_CONCURRENCY = 4;
/** Per-call output cap. */
const OCR_MAX_TOKENS = 1200;

export const BOOK_OCR_PROMPT = [
  'You extract text from a textbook page image for an educational assistant.',
  'Transcribe every piece of readable text exactly as shown, preserving natural reading order.',
  '- Transcribe headings, sentences, numbers, bullet points and lists.',
  '- Keep Bengali text as Bengali and other languages as they appear; do not translate.',
  '- If a line or word is unreadable, skip it. Never invent or paraphrase text.',
  '- If nothing is readable, output nothing.',
  'Output only the transcribed text. No commentary, no page numbers, no summaries.',
].join('\n');

interface PdfJsObjectLike {
  kind?: number;
  data?: Uint8Array | null;
}
interface PdfJsPageLike {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get(name: string): PdfJsObjectLike | undefined };
}
interface PdfJsDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPageLike>;
  destroy(): Promise<void> | void;
}
interface PdfJsApiLike {
  getDocument(options: { data: Uint8Array; disableWorker: boolean }): { promise: Promise<PdfJsDocumentLike> };
}

function getPdfjs(): PdfJsApiLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require(PDFJS_BUNDLE) as { pdfjsLib?: PdfJsApiLike; PDFJS?: PdfJsApiLike; default?: PdfJsApiLike } | PdfJsApiLike;
  const api = (raw as { pdfjsLib?: PdfJsApiLike }).pdfjsLib || (raw as { PDFJS?: PdfJsApiLike }).PDFJS || (raw as PdfJsApiLike);
  if (!api || typeof api.getDocument !== 'function') {
    throw new Error('Bundled pdfjs is unavailable (pdf-parse mismatch)');
  }
  return api;
}

/* ---------------------------------------------------------------- */
/* Minimal PNG encoder (no extra dependencies).                      */
/* ---------------------------------------------------------------- */

const CRC_TABLE = new Uint32Array(256).map((_unused, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function pngEncode(width: number, height: number, channels: 1 | 3 | 4, data: Uint8Array): Buffer {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    for (let x = 0; x < stride; x += 1) {
      raw[y * (stride + 1) + 1 + x] = data[y * stride + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

interface VisionImage {
  name: string;
  width: number;
  height: number;
  area: number;
  kind: number;
  data: Uint8Array;
}

function resolveChannels(kind: number, data: Uint8Array, width: number, height: number): 1 | 3 | 4 {
  const px = width * height;
  if (px > 0) {
    const perPx = data.length / px;
    if (perPx >= 2.5) return 4; // RGBA_32BPP
    if (perPx >= 1.5) return 3; // RGB_24BPP
    return 1; // GRAYSCALE_1BPP
  }
  // Fallback to the declared kind when the buffer length is inconclusive.
  return kind === 3 ? 4 : kind === 2 ? 3 : 1;
}

/** Encodes a pdfjs-decoded image (kind + pixel data) as a PNG buffer. */
export function encodePdfImage(image: { width: number; height: number; kind: number; data: Uint8Array }): Buffer {
  return pngEncode(image.width, image.height, resolveChannels(image.kind, image.data, image.width, image.height), image.data);
}

/* ---------------------------------------------------------------- */
/* OCR calls + concurrency pool                                       */
/* ---------------------------------------------------------------- */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T, index: number) => Promise<R>, concurrency: number): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runner = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch {
        results[index] = undefined as unknown as R;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

/* ---------------------------------------------------------------- */
/* Book OCR service                                                   */
/* ---------------------------------------------------------------- */

export const bookOcrService = {
  /**
   * Extracts text from an image-only PDF by OCR-ing its page images with the
   * configured vision model. Returns pages in order so chunkBookPages keeps
   * real page numbers, exactly like text extraction.
   */
  async extractPdfPagesViaVision(
    buffer: Buffer,
    title: string,
    options: { minArea?: number; maxPerPage?: number; concurrency?: number; onProgress?: (message: string) => void } = {}
  ): Promise<{ pages: PageText[]; warnings: string[]; pageCount: number; ocrCount: number; totalImages: number }> {
    const minArea = options.minArea ?? OCR_MIN_AREA;
    const maxPerPage = options.maxPerPage ?? OCR_MAX_PER_PAGE;
    const concurrency = Math.max(1, options.concurrency ?? OCR_CONCURRENCY);

    const pdfjs = getPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
    const pageCount = doc.numPages;
    const pages: PageText[] = [];
    let ocrCount = 0;
    let totalImages = 0;

    try {
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const page = await doc.getPage(pageIndex + 1);
        const ops = await page.getOperatorList();

        const images: VisionImage[] = [];
        for (let j = 0; j < ops.fnArray.length; j += 1) {
          if (ops.fnArray[j] !== PDFJS_OPS_PAINT_IMAGE) continue;
          const name = String(ops.argsArray[j][0]);
          const width = Number(ops.argsArray[j][1]);
          const height = Number(ops.argsArray[j][2]);
          const obj = page.objs.get(name);
          if (!obj || !obj.data || obj.data.length === 0) continue;
          if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
          if (width * height < minArea) continue;
          images.push({
            name,
            width,
            height,
            area: width * height,
            kind: obj.kind ?? 3,
            data: obj.data,
          });
        }
        totalImages += images.length;

        images.sort((a, b) => b.area - a.area);
        const selected = images.slice(0, maxPerPage);

        const texts = await mapWithConcurrency(
          selected,
          async (image) => {
            const png = encodePdfImage(image);
            const text = await this.ocrImage(png, title);
            ocrCount += 1;
            options.onProgress?.(`OCR page ${pageIndex + 1}/${pageCount} (${ocrCount}/${totalImages} images)`);
            return text;
          },
          concurrency
        );

        const pageText = texts.filter(Boolean).join('\n').trim();
        if (pageText) {
          pages.push({ pageIndex, pageLabel: String(pageIndex + 1), text: pageText });
        }
      }
    } finally {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }

    const warnings: string[] = [];
    if (ocrCount === 0) {
      warnings.push('Vision OCR found no processable images (all pages below 10,000 px or empty).');
    } else {
      warnings.push(`Vision OCR transcribed ${ocrCount} image(s) into ${pages.length} page(s) of text.`);
    }
    return { pages, warnings, pageCount, ocrCount, totalImages };
  },

  /** Sends one page image to the configured vision model for transcription. */
  async ocrImage(png: Buffer, title: string, options: { maxTokens?: number; signal?: AbortSignal } = {}): Promise<string> {
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: `${BOOK_OCR_PROMPT}\nTitle: ${title}` },
          { type: 'image_url' as const, image_url: { url: dataUrl } },
        ],
      },
    ];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const { text } = await OpenRouterClient.complete(messages as never, {
          temperature: 0,
          maxTokens: options.maxTokens ?? OCR_MAX_TOKENS,
          signal: options.signal,
        });
        return normalizeText(text);
      } catch (error) {
        if (attempt === 3) {
          log.warn('Book OCR image failed after retries', { title, message: (error as Error).message });
          return '';
        }
        await delay(1000 * attempt * attempt);
      }
    }
    return '';
  },
};

export default bookOcrService;
