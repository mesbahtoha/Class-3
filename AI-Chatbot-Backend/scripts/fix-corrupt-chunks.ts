/**
 * Marks existing chunks that were produced by the old OCR/encoding pipeline as
 * `pageType: 'noise'`, so they can never be retrieved by the tutor. The text is
 * kept for auditing; only search visibility changes.
 *
 * Dry run (default):   npm run db:fix-chunks
 * Apply:               npm run db:fix-chunks -- --apply
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { BookChunkModel } from '../src/database/models/BookChunk.model';
import { BookModel } from '../src/database/models/Book.model';
import { isLowQualityText } from '../src/services/rag/document-extraction.service';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await connectDatabase();
  try {
    const cursor = BookChunkModel.find({
      pageType: { $nin: ['toc', 'noise'] },
    })
      .select('_id bookId bookTitle pageStart text')
      .cursor();

    const badByBook = new Map<string, { title: string; count: number; samples: string[] }>();
    const ids: unknown[] = [];
    for await (const chunk of cursor) {
      if (!isLowQualityText(chunk.text || '')) continue;
      ids.push(chunk._id);
      const key = String(chunk.bookId);
      const entry = badByBook.get(key) ?? { title: chunk.bookTitle || key, count: 0, samples: [] };
      entry.count += 1;
      if (entry.samples.length < 2) entry.samples.push(`p${chunk.pageStart}: ${(chunk.text || '').slice(0, 80)}`);
      badByBook.set(key, entry);
    }

    console.log(apply ? 'Marking corrupt chunks as noise:' : 'Dry run. Corrupt chunks found (pass --apply to mark):');
    for (const [bookId, entry] of badByBook) {
      console.log(`  ${entry.title} (${bookId}): ${entry.count} chunk(s)`);
      for (const sample of entry.samples) console.log(`    - ${sample}`);
    }
    if (!ids.length) console.log('  none');
    if (!apply) return;

    if (ids.length) {
      const result = await BookChunkModel.updateMany(
        { _id: { $in: ids } },
        { $set: { pageType: 'noise', searchTerms: [] } }
      );
      console.log(`Marked ${result.modifiedCount} chunk(s) as noise.`);
    }

    // Legacy chunks predate `pageType`, so `$ne` (not `$in`) is required here.
    const books = await BookModel.find({}).select('_id').lean();
    for (const book of books) {
      const remaining = await BookChunkModel.countDocuments({ bookId: book._id, pageType: { $ne: 'noise' } });
      await BookModel.updateOne({ _id: book._id }, { $set: { chunkCount: remaining } });
      console.log(`  updated chunkCount for ${book._id}: ${remaining}`);
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  console.error('Chunk repair failed:', error);
  process.exit(1);
});
