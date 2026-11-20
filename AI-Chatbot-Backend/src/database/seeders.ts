import bcrypt from 'bcryptjs';
import env from '../config/env';
import {
  AdminModel,
  BookModel,
  BookChunkModel,
  PracticeQuestionModel,
  PracticeQuestionSetModel,
  PromptTemplateModel,
  SettingModel,
} from './models';
import { DEFAULT_SETTINGS, DEFAULT_PROMPT_TEMPLATES } from '../constants';
import { log } from '../config/logger';
import { stableChapterId } from '../services/practice/chapters.service';

const DEMO_BOOK_TITLE = 'Class 3 Demo Practice Book';
const DEMO_BOOK_SUBJECT = 'English';
const DEMO_SET_TITLE = 'Demo MCQ Practice Set';
const DEMO_QUESTION_TEXT = 'What is the capital of Bangladesh?';
const DEMO_OPTIONS = ['Dhaka', 'Chittagong', 'Khulna', 'Rajshahi'];

/**
 * Seeds an idempotent, fully published demo practice set so the system can be
 * shown without any admin setup: one published book with a chapter, one
 * published MCQ question set, and one demo MCQ question.
 */
async function seedPracticeDemo(): Promise<void> {
  const demoChapterId = stableChapterId('Chapter 1', 1);

  // 1. Demo book (published).
  const existingBook = await BookModel.findOne({ title: DEMO_BOOK_TITLE }).lean();
  const bookDoc = existingBook ?? (await BookModel.create({
    title: DEMO_BOOK_TITLE,
    grade: 'Class 3',
    curriculum: 'NCTB',
    subject: DEMO_BOOK_SUBJECT,
    language: 'en',
    publisher: '',
    edition: '',
    publicationState: 'published',
    processingState: 'ready',
    pageCount: 3,
    chunkCount: 1,
  }));
  const bookId = bookDoc._id;

  // 2. Demo chapter so students see a real chapter in the wizard.
  await BookChunkModel.updateOne(
    { bookId, chapterTitle: 'Chapter 1' },
    {
      $set: {
        bookId,
        bookTitle: DEMO_BOOK_TITLE,
        subject: DEMO_BOOK_SUBJECT,
        grade: 'Class 3',
        language: 'en',
        chapterId: null,
        chapterTitle: 'Chapter 1',
        chapterOrder: 1,
        pageStart: 1,
        pageEnd: 2,
        chunkIndex: 1,
        text: 'Class 3 practice and examination questions live in Chapter 1. This is a demo question used for showing.',
        normalizedText: 'class 3 practice and examination questions live in chapter 1 this is a demo question used for showing',
        preview: 'Demo chapter used by the Class 3 Practice & Examination system.',
      },
    },
    { upsert: true }
  );

  // 3. Demo question set (published, MCQ, practice enabled).
  const existingSet = await PracticeQuestionSetModel.findOne({ title: DEMO_SET_TITLE }).lean();
  const setDoc = existingSet ?? (await PracticeQuestionSetModel.create({
    title: DEMO_SET_TITLE,
    bookId,
    bookTitle: DEMO_BOOK_TITLE,
    subject: DEMO_BOOK_SUBJECT,
    chapters: [{ id: demoChapterId, title: 'Chapter 1', order: 1 }],
    questionType: 'mcq',
    difficulty: 'easy',
    instructions: 'Answer the multiple choice question. Submit when you are done.',
    marksPerQuestion: 1,
    totalQuestions: 1,
    totalMarks: 1,
    practiceModeEnabled: true,
    examModeEnabled: false,
    publicationState: 'published',
  }));
  const setId = setDoc?._id;

  // 4. Demo MCQ question inside the set.
  if (setId) {
    const hasQuestion = await PracticeQuestionModel.countDocuments({ setId, questionType: 'mcq' });
    if (hasQuestion === 0) {
      await PracticeQuestionModel.create({
        setId,
        bookId,
        chapterId: demoChapterId,
        chapterTitle: 'Chapter 1',
        questionType: 'mcq',
        order: 1,
        marks: 1,
        payload: { question: DEMO_QUESTION_TEXT, options: DEMO_OPTIONS },
        answer: { correctIndex: 0 },
        alternatives: [],
      });
      log.info('Demo practice question seeded', { question: DEMO_QUESTION_TEXT });
    }
    await PracticeQuestionSetModel.updateOne({ _id: setId }, { $set: { totalQuestions: 1, totalMarks: 1 } });
  }
}

/**
 * Seeds the database on boot:
 *  1. Default admin (admin@gmail.com / admin123) - only when no admin exists.
 *  2. Default settings (only missing keys are inserted, never overwrite).
 *  3. Default prompt templates (only when none exist).
 *  4. Demo practice data (idempotent).
 */
export async function seedDatabase(): Promise<void> {
  await seedAdmin();
  await seedSettings();
  await seedPromptTemplates();
  await seedPracticeDemo();
}

async function seedAdmin(): Promise<void> {
  // Legacy cleanup: remove old admin records that have no password hash
  // (created by the original app without any auth) - they are unusable.
  await AdminModel.deleteMany({ passwordHash: { $exists: false } });
  await AdminModel.deleteMany({ passwordHash: '' });

  const email = env.admin.email.toLowerCase().trim();
  const existing = await AdminModel.findOne({ email });

  if (existing) {
    // Ensure the default admin is active even if it was disabled.
    await AdminModel.updateOne(
      { _id: existing._id },
      { $set: { isActive: true } }
    );
    return;
  }

  const passwordHash = bcrypt.hashSync(env.admin.password, 10);
  const admin = await AdminModel.create({
    name: env.admin.name,
    email,
    passwordHash,
    role: 'superadmin',
    isActive: true,
    lastLoginAt: null,
  });

  log.info('Default admin seeded', { email: admin.email });
}

async function seedSettings(): Promise<void> {
  // Insert-only for missing keys so existing deployments gain new tutor keys
  // without overwriting admin-customized values.
  const existing = await SettingModel.find().select('key').lean();
  const have = new Set(existing.map((d) => d.key));
  const missing = Object.entries(DEFAULT_SETTINGS)
    .filter(([key]) => !have.has(key))
    .map(([key, value]) => ({ key, value, group: key.split('.')[0], description: '' }));
  if (missing.length) {
    await SettingModel.insertMany(missing);
    log.info('Missing settings seeded', { count: missing.length });
  }
}

async function seedPromptTemplates(): Promise<void> {
  const existingCount = await PromptTemplateModel.countDocuments();
  if (existingCount > 0) return;

  await PromptTemplateModel.insertMany(
    (DEFAULT_PROMPT_TEMPLATES as readonly { name: string; key: string; description: string; content: string; isActive: boolean; isDefault: boolean }[]).map(
      (template) => ({ ...template })
    )
  );
  log.info('Default prompt templates seeded');
}