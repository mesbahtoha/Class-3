import fs from 'fs';
import os from 'os';
import path from 'path';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import env from '../../config/env';
import OpenRouterClient from '../openrouter.client';
import { log } from '../../config/logger';
import { normalizeText } from '../../utils/text.utils';

/**
 * OCR for scanned textbook pages.
 *
 * Default strategy is hybrid and cost-aware:
 *   1. Local Tesseract (Bengali or English traineddata) on every page.
 *   2. A vision model only when Tesseract is unsure, the page looks math
 *      heavy, or the page returned almost nothing.
 *
 * The result of every page is cached on disk, so a failed or interrupted
 * ingestion can resume without paying for the same page twice.
 */

export type OcrProvider = 'tesseract' | 'vision' | 'hybrid';

export interface OcrConfig {
  provider: OcrProvider;
  visionModel: string;
  visionThreshold: number;
  concurrency: number;
  cacheRoot: string;
  maxTokens: number;
}

export interface OcrPageOptions {
  bookTitle: string;
  language: 'bn' | 'en';
  pageIndex: number;
  cacheKey: string;
  scale: number;
}

export interface OcrPageResult {
  text: string;
  provider: 'tesseract' | 'vision' | 'none';
  confidence: number;
  warnings: string[];
  cached: boolean;
  visionUsage?: { totalTokens?: number; cost?: number };
}

const DEFAULT_CONFIG: OcrConfig = {
  provider: env.ocr.provider,
  visionModel: env.ocr.visionModel,
  visionThreshold: env.ocr.visionThreshold,
  concurrency: env.ocr.concurrency,
  cacheRoot: env.ocr.cacheRoot,
  maxTokens: env.ocr.maxTokens,
};

let config: OcrConfig = { ...DEFAULT_CONFIG };

export function setOcrConfig(next: Partial<OcrConfig>): void {
  const previous = config;
  config = { ...config, ...next };
  if (next.concurrency && next.concurrency !== previous.concurrency) {
    void terminateOcr();
  }
}

export function getOcrConfig(): OcrConfig {
  return { ...config };
}

export function ocrCacheRoot(): string {
  return config.cacheRoot;
}

const VISION_PROMPT = [
  "You transcribe a scanned textbook page for a children's educational assistant.",
  'Rules:',
  '- Output the exact text in natural reading order, in the original language and script.',
  '- Preserve every number, punctuation mark, and heading exactly. Numbers matter.',
  '- Do not translate, summarize, explain, or add anything.',
  '- Ignore decorative page borders, logos and printed page numbers.',
  '- If a word is genuinely unreadable, write [unclear] instead of guessing.',
  'Output only the transcription.',
].join('\n');

/* ------------------------------------------------------------------ */
/* Tesseract worker pool                                              */
/* ------------------------------------------------------------------ */

class WorkerPool {
  private workers: Worker[] = [];
  private available: Worker[] = [];
  private waiting: Array<(worker: Worker) => void> = [];
  private creating: Promise<void> | null = null;

  constructor(private readonly language: string, private readonly size: number) {}

  private async createOne(): Promise<Worker> {
    const cachePath = path.join(os.tmpdir(), 'shikhi-tesseract-cache');
    await fs.promises.mkdir(cachePath, { recursive: true }).catch(() => undefined);
    return createWorker(this.language, 1, {
      cachePath,
      logger: () => undefined,
      errorHandler: (error) => log.warn('Tesseract worker error', { message: String(error) }),
    });
  }

  private async ensureCreated(): Promise<void> {
    if (!this.creating) {
      this.creating = (async () => {
        for (let i = 0; i < this.size; i += 1) {
          const worker = await this.createOne();
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
            preserve_interword_spaces: '1',
            user_defined_dpi: '300',
          });
          this.workers.push(worker);
          this.available.push(worker);
        }
      })();
    }
    await this.creating;
  }

  async acquire(): Promise<Worker> {
    await this.ensureCreated();
    const worker = this.available.pop();
    if (worker) return worker;
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release(worker: Worker): void {
    const next = this.waiting.shift();
    if (next) next(worker);
    else this.available.push(worker);
  }

  async replace(broken: Worker): Promise<Worker> {
    this.workers = this.workers.filter((worker) => worker !== broken);
    try {
      await broken.terminate();
    } catch {
      /* ignore */
    }
    const replacement = await this.createOne();
    await replacement.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    this.workers.push(replacement);
    return replacement;
  }

  async terminate(): Promise<void> {
    const workers = [...this.workers];
    this.workers = [];
    this.available = [];
    this.creating = null;
    await Promise.allSettled(workers.map((worker) => worker.terminate()));
  }
}

const pools = new Map<string, WorkerPool>();

function poolFor(language: 'bn' | 'en'): WorkerPool {
  const key = language === 'bn' ? 'ben' : 'eng';
  let pool = pools.get(key);
  if (!pool) {
    pool = new WorkerPool(key, config.concurrency);
    pools.set(key, pool);
  }
  return pool;
}

export async function terminateOcr(): Promise<void> {
  await Promise.allSettled(Array.from(pools.values()).map((pool) => pool.terminate()));
  pools.clear();
}

async function tesseractPage(png: Buffer, language: 'bn' | 'en'): Promise<{ text: string; confidence: number }> {
  const pool = poolFor(language);
  const worker = await pool.acquire();
  let replaced = false;
  try {
    const { data } = await worker.recognize(png);
    return { text: normalizeText(data.text || ''), confidence: Number(data.confidence || 0) };
  } catch (error) {
    log.warn('Tesseract page failed; replacing worker', { message: (error as Error).message });
    await pool.replace(worker);
    replaced = true;
    throw error;
  } finally {
    if (!replaced) pool.release(worker);
  }
}

/* ------------------------------------------------------------------ */
/* Vision fallback                                                    */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fatalVisionError(message: string): boolean {
  return /402|requires more credits|insufficient|401|403|invalid api key|no auth|unauthorized/i.test(message);
}

function retryableVisionError(message: string): boolean {
  return /429|rate limit|too many requests|timeout|timed out|502|503|504|overloaded|temporarily/i.test(message);
}

async function visionPage(
  png: Buffer,
  options: OcrPageOptions
): Promise<{ text: string; usage?: { totalTokens?: number; cost?: number }; warnings: string[] }> {
  const warnings: string[] = [];
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const messages = [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: `${VISION_PROMPT}\nBook: ${options.bookTitle}\nLanguage: ${options.language === 'bn' ? 'Bengali' : 'English'}`,
        },
        { type: 'image_url' as const, image_url: { url: dataUrl } },
      ],
    },
  ];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await OpenRouterClient.complete(messages as never, {
        apiKey: env.openRouter.apiKey,
        model: config.visionModel,
        temperature: 0,
        maxTokens: config.maxTokens,
        signal: AbortSignal.timeout(90_000),
      });
      return {
        text: normalizeText(result.text || ''),
        usage: { totalTokens: result.usage.totalTokens, cost: result.usage.cost },
        warnings,
      };
    } catch (error) {
      const message = (error as Error).message || 'Vision OCR failed';
      if (fatalVisionError(message)) {
        warnings.push(`Vision OCR unavailable: ${message}`);
        return { text: '', warnings };
      }
      if (attempt === 3 || !retryableVisionError(message)) {
        warnings.push(`Vision OCR failed: ${message}`);
        return { text: '', warnings };
      }
      await sleep(1200 * attempt * attempt + Math.floor(Math.random() * 400));
    }
  }
  return { text: '', warnings };
}

/* ------------------------------------------------------------------ */
/* Quality checks + text cleanup                                      */
/* ------------------------------------------------------------------ */

function visibleLength(text: string): number {
  return text.replace(/\s/g, '').length;
}

function looksLikeRefusal(text: string): boolean {
  return /(i'm sorry|i am sorry|i cannot|i can't|unable to|no readable text|the image (contains|shows)|here is the transcription)/i.test(
    text
  );
}

function bengaliRatio(text: string): number {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return 0;
  const bengali = letters.match(/[\u0980-\u09FF]/g)?.length ?? 0;
  return bengali / letters.length;
}

function looksMathHeavy(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const digits = (text.match(/[0-9০-৯]/g) ?? []).length;
  const symbols = (text.match(/[=+×÷<>]/g) ?? []).length;
  return digits / words > 0.16 || symbols >= 3;
}

function looksLikeTableOfContents(text: string): boolean {
  return /(সূচিপত্র|সূচি|table of contents|contents)/i.test(text.slice(0, 400));
}

function needsVision(text: string, confidence: number, language: 'bn' | 'en'): boolean {
  if (visibleLength(text) < 40) return true;
  if (confidence > 0 && confidence < config.visionThreshold) return true;
  if (looksLikeRefusal(text)) return true;
  if (language === 'bn' && bengaliRatio(text) < 0.32) return true;
  // Chapter titles and page numbers in a table of contents must be exact.
  if (looksLikeTableOfContents(text)) return true;
  return looksMathHeavy(text);
}

/** Removes model commentary and obvious page furniture from OCR output. */
export function cleanOcrText(raw: string): string {
  const lines = normalizeText(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (looksLikeRefusal(line)) return false;
      if (/^\[?(unclear|অস্পষ্ট)\]?$/i.test(line)) return false;
      return true;
    });

  // Drop a lone page number at the very top or bottom.
  if (lines.length > 2 && /^[-–—\s]*[0-9০-৯]{1,4}[-–—\s]*$/.test(lines[0])) lines.shift();
  if (lines.length > 2 && /^[-–—\s]*[0-9০-৯]{1,4}[-–—\s]*$/.test(lines[lines.length - 1])) lines.pop();

  let text = lines.join('\n');

  // Common Bengali OCR confusions. Keep this list short and high precision.
  const corrections: Array<[RegExp, string]> = [
    [/গণ্প্রজাতন্ত্রী/g, 'গণপ্রজাতন্ত্রী'],
    [/রত্তবর্ণ/g, 'রক্তবর্ণ'],
    [/প্রস্ন/g, 'প্রশ্ন'],
    [/ভুবন/g, 'ভবন'],
    [/পাচ(?=\s|$)/g, 'পাঁচ'],
    [/৷/g, '।'],
  ];
  for (const [pattern, replacement] of corrections) text = text.replace(pattern, replacement);

  // Measurements are commonly read as "X :" or "X ১:" by Tesseract.
  text = text.replace(/\bX\s*[:১:]\s*/gi, ' X ').replace(/\s*X\s*:\s*/g, ' X ');
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([।,;:]|[')}])/g, '$1');

  return normalizeText(text)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Disk cache                                                         */
/* ------------------------------------------------------------------ */

function safeSegment(value: string): string {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

function cacheFile(options: OcrPageOptions): string {
  const folder = path.join(config.cacheRoot, safeSegment(options.cacheKey));
  const name = `${safeSegment(config.provider)}-${safeSegment(config.visionModel)}-s${options.scale}-p${String(
    options.pageIndex + 1
  ).padStart(4, '0')}.json`;
  return path.join(folder, name);
}

async function readCache(options: OcrPageOptions): Promise<OcrPageResult | null> {
  try {
    const raw = await fs.promises.readFile(cacheFile(options), 'utf8');
    const parsed = JSON.parse(raw) as OcrPageResult;
    if (typeof parsed?.text !== 'string') return null;
    return { ...parsed, cached: true };
  } catch {
    return null;
  }
}

async function writeCache(options: OcrPageOptions, result: OcrPageResult): Promise<void> {
  try {
    const file = cacheFile(options);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify({ ...result, cached: false }), 'utf8');
    await fs.promises.rename(temp, file);
  } catch (error) {
    log.warn('Could not write OCR cache', { message: (error as Error).message });
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function ocrPage(png: Buffer, options: OcrPageOptions): Promise<OcrPageResult> {
  const cached = await readCache(options);
  // Tables of contents produced by local OCR often garble chapter titles.
  // Upgrade them once with the vision model instead of trusting the cache.
  const needsTocUpgrade =
    config.provider === 'hybrid' &&
    cached?.provider === 'tesseract' &&
    looksLikeTableOfContents(cached.text);
  if (cached && !needsTocUpgrade) return cached;

  const warnings: string[] = [];
  let tesseractText = '';
  let tesseractConfidence = 0;
  const forceVision = needsTocUpgrade;

  // Always run local OCR, even for a forced vision upgrade, so a failed or
  // rate-limited vision call still leaves readable text behind.
  if (config.provider !== 'vision') {
    try {
      const result = await tesseractPage(png, options.language);
      tesseractText = cleanOcrText(result.text);
      tesseractConfidence = result.confidence;
    } catch (error) {
      warnings.push(`Local OCR failed: ${(error as Error).message}`);
    }
  }

  const useVision =
    forceVision ||
    config.provider === 'vision' ||
    (config.provider === 'hybrid' && needsVision(tesseractText, tesseractConfidence, options.language));

  let finalText = tesseractText;
  let provider: OcrPageResult['provider'] = tesseractText ? 'tesseract' : 'none';
  let visionUsage: OcrPageResult['visionUsage'];

  if (useVision) {
    const vision = await visionPage(png, options);
    warnings.push(...vision.warnings);
    visionUsage = vision.usage;
    const visionText = cleanOcrText(vision.text);
    if (visionText && !looksLikeRefusal(visionText)) {
      // Prefer vision when it recovered clearly more text, or when local OCR
      // was empty/very uncertain.
      const localLength = visibleLength(finalText);
      const visionLength = visibleLength(visionText);
      if (forceVision || !finalText || visionLength > localLength * 1.15 || tesseractConfidence < config.visionThreshold) {
        finalText = visionText;
        provider = 'vision';
        tesseractConfidence = 0;
      }
    }
  }

  const result: OcrPageResult = {
    text: finalText,
    provider,
    confidence: provider === 'vision' ? 0 : Math.round(tesseractConfidence),
    warnings,
    cached: false,
    ...(visionUsage ? { visionUsage } : {}),
  };

  // Only cache a successful transcription. A transient provider failure is
  // retried on the next run instead of being remembered as "empty page".
  if (result.text || provider === 'tesseract') await writeCache(options, result);
  return result;
}
