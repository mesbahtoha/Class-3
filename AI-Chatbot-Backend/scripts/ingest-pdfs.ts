/**
 * One-off migration / reindex tool for the four Class 3 textbook PDFs.
 *
 * Every PDF is opened page by page. Pages with a selectable text layer use it;
 * scanned pages are rendered at a high resolution and OCR'd with Tesseract and,
 * when needed, a vision model. Results are cached on disk, so re-running never
 * pays for the same page twice.
 *
 * Run: npm run ingest:pdfs -- [options]
 * Options:
 *   --reindex            Re-index books that already exist (replaces old chunks).
 *   --only <text>        Only process PDFs whose filename contains this text.
 *   --limit-pages <n>    Process at most n pages per book (smoke tests).
 *   --provider <name>    tesseract | vision | hybrid (default: hybrid).
 *   --model <name>       Vision model for OCR fallback.
 *   --scale <n>          Page render scale (default 3).
 *   --concurrency <n>    Parallel OCR workers (default 3).
 *   --verify-only        Skip ingestion, only run retrieval checks.
 *   --answer-check       Also perform one live Tutor answer check.
 *   --dry-run            List files and planned actions without writing.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { BookModel } from '../src/database/models/Book.model';
import { BookChunkModel } from '../src/database/models/BookChunk.model';
import { IngestionJobModel } from '../src/database/models/IngestionJob.model';
import { uploadBuffer } from '../src/config/gridfs';
import { checksum } from '../src/services/rag/document-extraction.service';
import { bookIngestionService } from '../src/services/rag/book-ingestion.service';
import { retrieveBookChunks } from '../src/services/rag/retrieval.service';
import { tutorService } from '../src/services/ai/tutor.service';
import { terminateOcr } from '../src/services/rag/ocr.service';
import { normalizeText } from '../src/utils/text.utils';
import type { OcrProvider } from '../src/services/rag/ocr.service';

const PDF_DIR = path.resolve(__dirname, '..', '..', 'Pdf');
/** Migration-only: the admin upload path keeps a smaller limit. */
const MIGRATION_MAX_BYTES = 60 * 1024 * 1024;

interface CliOptions {
  reindex: boolean;
  only?: string;
  limitPages?: number;
  provider?: OcrProvider;
  model?: string;
  scale?: number;
  concurrency?: number;
  verifyOnly: boolean;
  answerCheck: boolean;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const value = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    reindex: args.includes('--reindex'),
    only: value('--only'),
    limitPages: value('--limit-pages') ? Number(value('--limit-pages')) : undefined,
    provider: value('--provider') as OcrProvider | undefined,
    model: value('--model'),
    scale: value('--scale') ? Number(value('--scale')) : undefined,
    concurrency: value('--concurrency') ? Number(value('--concurrency')) : undefined,
    verifyOnly: args.includes('--verify-only'),
    answerCheck: args.includes('--answer-check'),
    dryRun: args.includes('--dry-run'),
  };
}

/** Atlas rejects some language overrides on text-indexed collections; fall back to 'en'. */
async function createBookDocument(language: string, payload: Record<string, unknown>) {
  try {
    return await BookModel.create(payload);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 17262) {
      console.log(`    (Atlas rejected language '${language}' - retrying with 'en')`);
      return await BookModel.create({ ...payload, language: 'en' });
    }
    throw error;
  }
}

/** All four NCTB Class 3 books in this folder are Bengali-medium scans. */
function metaFor(fileName: string): { subject: string; language: 'bn' | 'en' } {
  if (/bangla/i.test(fileName)) return { subject: 'Bangla', language: 'bn' };
  if (/math/i.test(fileName)) return { subject: 'Math', language: 'bn' };
  if (/science/i.test(fileName)) return { subject: 'Science', language: 'bn' };
  if (/islam/i.test(fileName)) return { subject: 'Islam', language: 'bn' };
  return { subject: 'General', language: 'bn' };
}

async function ingestAndPublish(fileName: string, buffer: Buffer, options: CliOptions): Promise<void> {
  const sum = checksum(buffer);
  const meta = metaFor(fileName);
  const title = normalizeText(fileName.replace(/\.pdf$/i, ''));

  const existing = await BookModel.findOne({ checksum: sum }).lean();
  if (existing && !options.reindex) {
    const ready = existing.processingState === 'ready' && (existing.chunkCount ?? 0) > 0;
    console.log(
      `  EXISTS ${fileName} -> "${existing.title}" (${existing.publicationState}), state=${existing.processingState} chunks=${existing.chunkCount ?? 0}.`
    );
    if (ready && existing.publicationState === 'published') return;
  }

  if (options.dryRun) {
    console.log(`  ${existing ? 'REINDEX' : 'INGEST'} ${fileName} -> "${title}" (${meta.subject}) [dry run]`);
    return;
  }

  let bookId = existing?._id;
  if (!bookId) {
    console.log(`  INGEST ${fileName} -> Book "${title}" (${meta.subject})`);
    const fileId = await uploadBuffer(buffer, `migration-${Date.now()}-${fileName}`, 'application/pdf', {
      title,
      kind: 'book',
    });
    const book = await createBookDocument(meta.language, {
      title,
      subject: meta.subject,
      grade: 'Class 3',
      curriculum: 'NCTB',
      language: meta.language,
      ocrLanguage: meta.language,
      edition: '',
      rightsStatus: 'unverified',
      fileId,
      fileType: 'application/pdf',
      fileSize: buffer.length,
      checksum: sum,
      processingState: 'processing',
      processingProgress: 5,
      publicationState: 'draft',
      uploadedBy: 'admin',
    });
    bookId = book._id;
  } else {
    console.log(`  REINDEX ${fileName} -> "${title}" (${existing?.title})`);
  }

  const job = await IngestionJobModel.create({
    bookId,
    kind: existing ? 'reindex' : 'ingest',
    state: 'queued',
    progress: 0,
  });
  await bookIngestionService.processJob(String(job._id), {
    force: true,
    publish: true,
    ...(options.limitPages ? { maxPages: options.limitPages } : {}),
    ...(options.provider ? { ocrProvider: options.provider } : {}),
    ...(options.model ? { ocrModel: options.model } : {}),
    ...(options.scale ? { ocrScale: options.scale } : {}),
    ...(options.concurrency ? { ocrConcurrency: options.concurrency } : {}),
    onProgress: (message) => console.log(`    ${message}`),
  });

  const refreshed = await BookModel.findById(bookId).lean();
  const ready = refreshed?.processingState === 'ready' && (refreshed?.chunkCount ?? 0) > 0;
  console.log(`    state=${refreshed?.processingState} chunks=${refreshed?.chunkCount} pages=${refreshed?.pageCount}`);
  if (ready && refreshed?.publicationState !== 'published') {
    await BookModel.updateOne({ _id: bookId }, {
      $set: { publicationState: 'published', publishedAt: new Date(), publishedBy: 'admin', reviewedBy: 'admin' },
    });
    console.log('    -> published.');
  }
}

/** Curated questions whose answers are visible in the Class 3 books. */
const SAMPLE_QUERIES: Record<string, string[]> = {
  Bangla: ['জাতীয় পতাকা কেমন?', 'পতাকা তৈরির নিয়ম', 'বাংলা বর্ণমালা'],
  Math: ['ভগ্নাংশ কী?', 'দৈর্ঘ্য পরিমাপ', 'যোগ', 'গুণ'],
  Science: ['গাছের অংশ', 'পানি', 'সূর্য'],
  Islam: ['নামাজ', 'আল্লাহ', 'কুরআন'],
};

async function verify(options: CliOptions): Promise<void> {
  const books = await BookModel.find({ publicationState: 'published' }).sort({ title: 1 }).lean();
  console.log(`\nPublished books: ${books.length}`);
  let failures = 0;
  for (const book of books) {
    const chunkCount = await BookChunkModel.countDocuments({ bookId: book._id });
    const sample = await BookChunkModel.findOne({ bookId: book._id }).sort({ pageStart: 1 }).lean();
    console.log(`\n  Book: "${book.title}" subject=${book.subject} language=${book.language} chunks=${chunkCount}`);
    if (sample?.text) console.log(`    first chunk p${sample.pageStart}: ${sample.text.slice(0, 110)}`);

    const queries = SAMPLE_QUERIES[book.subject] ?? [];
    for (const query of queries) {
      const results = await retrieveBookChunks(query, { bookId: String(book._id) }, 3);
      const top = results[0];
      const ok = Boolean(top && top.matchedTotal > 0);
      if (!ok) failures += 1;
      console.log(
        `    ${ok ? 'OK  ' : 'MISS'} "${query}" -> ${results.length} chunks` +
          (top ? ` (top score=${top.score.toFixed(2)} pages=${top.pageStart}-${top.pageEnd} matches=${top.matchedTotal})` : '')
      );
    }
  }

  if (options.answerCheck) {
    const mathBook = await BookModel.findOne({ subject: 'Math', publicationState: 'published' }).lean();
    const sample = await BookChunkModel.findOne(mathBook ? { bookId: mathBook._id } : {}).lean();
    const question = normalizeText(sample?.text ?? '').slice(0, 150);
    if (question) {
      console.log(`\n  Tutor check: "${question.slice(0, 80)}..."`);
      const response = await tutorService.answer({ message: question, language: 'auto' });
      console.log(`    status=${response.answerStatus} confidence=${response.confidence} language=${response.answerLanguage}`);
      console.log(`    answer=${response.answer.slice(0, 350)}`);
      console.log(`    sources=${(response.sources ?? []).map((s) => s.bookTitle).join(', ')}`);
    }
  }

  console.log(`\nVerification: ${failures === 0 ? 'ALL QUERIES MATCHED' : `${failures} query miss(es)`}`);
}

async function main(): Promise<void> {
  const options = parseArgs();
  console.log(`PDF dir: ${PDF_DIR}`);
  console.log(`DB: ${process.env.DB_NAME || 'ChatBot_DB'} (override DB_NAME to use an isolated database)`);
  await connectDatabase();

  if (!options.verifyOnly) {
    let files = readdirSync(PDF_DIR).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
    if (options.only) files = files.filter((name) => name.toLowerCase().includes(options.only!.toLowerCase()));
    console.log(`Found ${files.length} PDF file(s).`);

    for (const fileName of files) {
      const buffer = readFileSync(path.join(PDF_DIR, fileName));
      if (buffer.length > MIGRATION_MAX_BYTES) {
        console.log(`  SKIP ${fileName}: exceeds the migration limit of ${MIGRATION_MAX_BYTES / (1024 * 1024)}MB.`);
        continue;
      }
      await ingestAndPublish(fileName, buffer, options);
    }
  }

  await verify(options);
  await terminateOcr();
  await disconnectDatabase();
  console.log('Migration finished.');
}

main()
  .catch((error: unknown) => {
    console.error('FATAL:', error);
    process.exit(1);
  });
