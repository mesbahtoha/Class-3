/**
 * One-off migration: ingests every PDF in the local `Pdf/` folder into the Book
 * catalogue as a PUBLISHED book (idempotent by checksum), then verifies the RAG
 * pipeline can find content and runs an end-to-end Tutor answer check.
 *
 * Run: npm run ingest:pdfs
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
import { normalizeText } from '../src/utils/text.utils';

const PDF_DIR = path.resolve(__dirname, '..', '..', 'Pdf');
/** Migration-only: the admin upload path keeps its 30MB limit. */
const MIGRATION_MAX_BYTES = 60 * 1024 * 1024;

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

function metaFor(fileName: string): { subject: string; language: string } {
  if (/bangla/i.test(fileName)) return { subject: 'Bangla', language: 'bn' };
  if (/math/i.test(fileName)) return { subject: 'Math', language: 'en' };
  if (/science/i.test(fileName)) return { subject: 'Science', language: 'en' };
  if (/islam/i.test(fileName)) return { subject: 'Islam', language: 'en' };
  return { subject: 'General', language: 'en' };
}

async function ingestAndPublish(fileName: string, buffer: Buffer): Promise<void> {
  const sum = checksum(buffer);
  const meta = metaFor(fileName);
  const title = normalizeText(fileName.replace(/\.pdf$/i, ''));

  const existing = await BookModel.findOne({ checksum: sum }).lean();
  if (existing) {
    console.log(`  EXISTS ${fileName} -> Book "${existing.title}" (${existing.publicationState}), state=${existing.processingState} chunks=${existing.chunkCount ?? 0}.`);
    if (existing.publicationState === 'published') {
      return;
    }
    if (existing.processingState !== 'ready') {
      console.log('    -> re-ingesting (previous run failed or is incomplete)...');
      const job = await IngestionJobModel.create({ bookId: existing._id, kind: existing.chunkCount ? 'reindex' : 'ingest', state: 'queued', progress: 0 });
      await bookIngestionService.processJob(String(job._id));
    }
  } else {
    console.log(`  INGEST ${fileName} -> Book "${title}" (${meta.subject})`);
    const fileId = await uploadBuffer(buffer, `migration-${Date.now()}-${fileName}`, 'application/pdf', { title, kind: 'book' });
    const book = await createBookDocument(meta.language, {
      title,
      subject: meta.subject,
      grade: 'Class 3',
      curriculum: 'NCTB',
      language: meta.language,
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
    const job = await IngestionJobModel.create({ bookId: book._id, kind: 'ingest', state: 'queued', progress: 5 });
    await bookIngestionService.processJob(String(job._id));
    void book;
  }

  const refreshed = await BookModel.findOne({ title }).lean();
  const bookId = refreshed?._id;
  if (!bookId) {
    console.log('    -> book not found after ingestion (FAILED)');
    return;
  }
  const ready = refreshed?.processingState === 'ready' && (refreshed?.chunkCount ?? 0) > 0;
  console.log(`    state=${refreshed?.processingState} chunks=${refreshed?.chunkCount} pages=${refreshed?.pageCount}`);
  if (ready) {
    await BookModel.updateOne({ _id: bookId }, { $set: { publicationState: 'published', publishedAt: new Date(), publishedBy: 'admin', reviewedBy: 'admin' } });
    console.log('    -> published.');
  } else {
    console.log('    -> NOT published (no chunks).');
  }
}

async function main(): Promise<void> {
  console.log(`PDF dir: ${PDF_DIR}`);
  await connectDatabase();

  const files = readdirSync(PDF_DIR).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
  console.log(`Found ${files.length} PDF file(s).`);

  for (const fileName of files) {
    const buffer = readFileSync(path.join(PDF_DIR, fileName));
    if (buffer.length > MIGRATION_MAX_BYTES) {
      console.log(`  SKIP ${fileName}: exceeds the migration limit of ${MIGRATION_MAX_BYTES / (1024 * 1024)}MB.`);
      continue;
    }
    await ingestAndPublish(fileName, buffer);
  }

  /* ---- Verification: retrieval per published book ---- */
  const books = await BookModel.find({ publicationState: 'published' }).sort({ title: 1 }).lean();
  console.log(`\nPublished books: ${books.length}`);
  for (const book of books) {
    const chunkCount = await BookChunkModel.countDocuments({ bookId: book._id });
    const sample = await BookChunkModel.findOne({ bookId: book._id }).sort({ pageStart: 1 }).lean();
    console.log(`\n  Book: "${book.title}" subject=${book.subject} language=${book.language} chunks=${chunkCount}`);
    if (sample?.text) {
      const query = normalizeText(sample.text).slice(0, 100);
      const results = await retrieveBookChunks(query, { bookId: String(book._id) }, 3);
      console.log(`    sample retrieval (${results.length} match):`);
      results.forEach((result, index) => {
        console.log(`      #${index + 1} score=${result.score.toFixed(2)} pages=${result.pageStart}-${result.pageEnd} :: ${result.text.slice(0, 70)}`);
      });
    }
  }

  /* ---- Tutor end-to-end check against a published book ---- */
  const mathBook = await BookModel.findOne({ subject: 'Math', publicationState: 'published' }).sort({ createdAt: -1 }).lean();
  if (mathBook) {
    const sample = await BookChunkModel.findOne({ bookId: mathBook._id }).sort({ pageStart: 1 }).lean();
    const question = normalizeText(sample?.text ?? '').slice(0, 150);
    if (question) {
      console.log(`\n  Tutor check on "${question.slice(0, 80)}..."`);
      const response = await tutorService.answer({ message: question, language: 'auto' });
      console.log(`    confidence=${response.confidence} language=${response.answerLanguage}`);
      console.log(`    answer=${response.answer.slice(0, 300)}`);
      console.log(`    sources=${(response.sources ?? []).map((source) => source.bookTitle).slice(0, 3).join(', ')}`);
    }
  }

  await disconnectDatabase();
  console.log('Migration finished.');
}

main().catch((error: unknown) => {
  console.error('FATAL:', error);
  process.exit(1);
});
