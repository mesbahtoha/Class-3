/**
 * Removes the demo textbook, demo chapter, demo practice set, its questions and
 * any attempts made against it. Only records whose titles match the exact demo
 * names are touched.
 *
 * Dry run (default):   npx tsx scripts/remove-demo-practice-data.ts
 * Apply the deletion:  npx tsx scripts/remove-demo-practice-data.ts --apply
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { BookModel } from '../src/database/models/Book.model';
import { BookChunkModel } from '../src/database/models/BookChunk.model';
import { PracticeAttemptModel } from '../src/database/models/PracticeAttempt.model';
import { PracticeQuestionModel } from '../src/database/models/PracticeQuestion.model';
import { PracticeQuestionSetModel } from '../src/database/models/PracticeQuestionSet.model';

const DEMO_BOOK_TITLE = 'Class 3 Demo Practice Book';
const DEMO_SET_TITLE = 'Demo MCQ Practice Set';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await connectDatabase();

  try {
    const bookIds = (await BookModel.find({ title: DEMO_BOOK_TITLE }).select('_id').lean()).map((book) => book._id);
    const setIds = (
      await PracticeQuestionSetModel.find({ $or: [{ title: DEMO_SET_TITLE }, { bookId: { $in: bookIds } }] })
        .select('_id')
        .lean()
    ).map((set) => set._id);

    const counts = {
      books: bookIds.length,
      bookChunks: await BookChunkModel.countDocuments({ bookId: { $in: bookIds } }),
      questionSets: setIds.length,
      questions: await PracticeQuestionModel.countDocuments({ setId: { $in: setIds } }),
      attempts: await PracticeAttemptModel.countDocuments({ setId: { $in: setIds } }),
    };

    console.log(apply ? 'Deleting demo practice data:' : 'Dry run. Matching demo practice data (pass --apply to delete):', counts);
    if (!apply) return;

    await PracticeAttemptModel.deleteMany({ setId: { $in: setIds } });
    await PracticeQuestionModel.deleteMany({ setId: { $in: setIds } });
    await PracticeQuestionSetModel.deleteMany({ _id: { $in: setIds } });
    await BookChunkModel.deleteMany({ bookId: { $in: bookIds } });
    await BookModel.deleteMany({ _id: { $in: bookIds } });
    console.log('Demo practice data removed.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
