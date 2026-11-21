import path from 'path';
import { pathToFileURL } from 'url';
import { normalizeText } from '../../utils/text.utils';

/**
 * Per-page PDF reading and rendering.
 *
 * pdfjs-dist is ESM-only, while this backend compiles to CommonJS. A native
 * dynamic import is used so the same code works in `tsx` (dev) and in the
 * compiled `dist` build (production) without shipping extra loader files.
 */

interface PdfTextItem {
  str?: string;
  width?: number;
  height?: number;
  hasEOL?: boolean;
  transform?: number[];
}

interface PdfRenderTask {
  promise: Promise<void>;
}

interface PdfCanvasAndContext {
  canvas: { toBuffer?: (type?: string) => Buffer; width: number; height: number };
  context: unknown;
}

interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  render(options: Record<string, unknown>): PdfRenderTask;
  cleanup(): void;
}

interface PdfCanvasFactory {
  create(width: number, height: number): PdfCanvasAndContext;
  destroy(canvasAndContext: PdfCanvasAndContext): void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  canvasFactory?: PdfCanvasFactory;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

interface PdfjsModule {
  getDocument(options: Record<string, unknown>): PdfLoadingTask;
}

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Loads the ESM pdfjs build from CommonJS without a transpiled require(). */
export function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    const nativeImport = new Function('specifier', 'return import(specifier)') as (
      specifier: string
    ) => Promise<PdfjsModule>;
    pdfjsPromise = nativeImport('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

function assetUrl(folder: string): string {
  try {
    const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    return `${pathToFileURL(path.join(packageRoot, folder)).href.replace(/\/?$/, '/')}`;
  } catch {
    return '';
  }
}

export interface OpenedPdf {
  pageCount: number;
  /** Selectable text for a page (empty for scanned pages). */
  extractText(pageIndex: number): Promise<string>;
  /** Renders a page to a PNG buffer at the requested scale. */
  renderPage(pageIndex: number, scale: number): Promise<Buffer>;
  close(): Promise<void>;
}

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

/** Opens a PDF once so callers can walk pages without re-parsing the file. */
export async function openPdf(buffer: Buffer): Promise<OpenedPdf> {
  if (!isPdfBuffer(buffer)) {
    throw Object.assign(new Error('Uploaded file is not a valid PDF (signature check failed).'), { statusCode: 400 });
  }

  const pdfjs = await loadPdfjs();
  const standardFontDataUrl = assetUrl('standard_fonts');
  const cMapUrl = assetUrl('cmaps');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
    ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
    ...(cMapUrl ? { cMapUrl, cMapPacked: true } : {}),
  });
  const document = await loadingTask.promise;

  return {
    pageCount: document.numPages,

    async extractText(pageIndex: number): Promise<string> {
      const page = await document.getPage(pageIndex + 1);
      try {
        const content = await page.getTextContent();
        return normalizeText(reconstructText(content.items));
      } finally {
        page.cleanup();
      }
    },

    async renderPage(pageIndex: number, scale: number): Promise<Buffer> {
      const page = await document.getPage(pageIndex + 1);
      try {
        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));

        let canvasAndContext: PdfCanvasAndContext;
        let ownsCanvas = false;
        if (document.canvasFactory) {
          canvasAndContext = document.canvasFactory.create(width, height);
        } else {
          // Fallback for pdfjs versions that do not expose a canvas factory.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createCanvas } = require('@napi-rs/canvas') as {
            createCanvas: (
              w: number,
              h: number
            ) => { width: number; height: number; getContext(type: '2d'): unknown; toBuffer(type?: string): Buffer };
          };
          const canvas = createCanvas(width, height);
          canvasAndContext = { canvas, context: canvas.getContext('2d') };
          ownsCanvas = true;
        }

        await page.render({ canvasContext: canvasAndContext.context, viewport }).promise;
        const png = canvasAndContext.canvas.toBuffer
          ? canvasAndContext.canvas.toBuffer('image/png')
          : Buffer.alloc(0);
        if (!ownsCanvas && document.canvasFactory) document.canvasFactory.destroy(canvasAndContext);
        if (!png.length) throw new Error('Page rendering produced no image data');
        return png;
      } finally {
        page.cleanup();
      }
    },

    async close(): Promise<void> {
      try {
        await loadingTask.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Rebuilds readable lines from pdfjs text items. Items on the same baseline
 * are joined, real line breaks are preserved, and only visible gaps become
 * spaces (important for Bengali, where glyphs arrive as separate items).
 */
function reconstructText(items: PdfTextItem[]): string {
  let out = '';
  let previousY: number | null = null;
  let previousEndX: number | null = null;

  for (const item of items) {
    const text = item.str ?? '';
    if (!text) {
      if (item.hasEOL) out += '\n';
      continue;
    }

    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const fontSize = Math.abs(item.height ?? item.transform?.[3] ?? 10) || 10;

    if (previousY !== null && Math.abs(y - previousY) > Math.max(1.5, fontSize * 0.35)) {
      if (!out.endsWith('\n')) out += '\n';
      previousEndX = null;
    } else if (previousEndX !== null) {
      const gap = x - previousEndX;
      if (gap > Math.max(1.2, fontSize * 0.12) && out && !out.endsWith(' ') && !out.endsWith('\n')) {
        out += ' ';
      }
    }

    out += text;
    previousEndX = x + (item.width ?? 0);
    previousY = y;

    if (item.hasEOL) {
      out += '\n';
      previousEndX = null;
    }
  }

  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
