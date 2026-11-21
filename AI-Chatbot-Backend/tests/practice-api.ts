/**
 * End-to-end API tests for the Practice & Examination system.
 *
 * Runs against a live backend and a dedicated TEST database. It creates its
 * own book, chapters, question sets and students, and removes its book and
 * sets when finished.
 *
 * Required environment:
 *   PRACTICE_TEST_API_URL     e.g. http://localhost:3000
 *   TEST_MONGO_URI            MongoDB connection string
 *   TEST_DB_NAME              must end with "_test" (guard against production data)
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD   an existing admin in the test database
 *
 * Run: npm run test:practice-api
 */
import { MongoClient, ObjectId } from 'mongodb';

const API_URL = (process.env.PRACTICE_TEST_API_URL ?? '').replace(/\/+$/, '');
const MONGO_URI = process.env.TEST_MONGO_URI ?? '';
const DB_NAME = process.env.TEST_DB_NAME ?? '';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? '';
const BASE = `${API_URL}/api/v1`;

if (!API_URL || !MONGO_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing PRACTICE_TEST_API_URL, TEST_MONGO_URI, TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD.');
  process.exit(1);
}
if (!DB_NAME.endsWith('_test')) {
  console.error(`Refusing to run: TEST_DB_NAME must end with "_test" (got "${DB_NAME}").`);
  process.exit(1);
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Result {
  status: number;
  body: Json;
}

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${detail ? ` (${detail})` : ''}`);
}

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Result> {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      connection: 'close',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Json;
  return { status: response.status, body: json.data ?? json };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function registerAndLogin(label: string): Promise<{ token: string; email: string }> {
  const email = `${label}${Date.now()}${Math.floor(Math.random() * 1000)}@practice-test.local`;
  await call('POST', '/auth/register', undefined, { name: `Test ${label}`, email, password: 'secret123' });
  // Registration and login inside the same second produce identical refresh tokens.
  await sleep(1100);
  const login = await call('POST', '/auth/login', undefined, { email, password: 'secret123' });
  return { token: login.body?.tokens?.accessToken, email };
}

async function main(): Promise<void> {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  const db = mongo.db(DB_NAME);
  const runId = Date.now();
  const bookTitle = `Practice API test book ${runId}`;
  let bookId = '';

  try {
    // ---- Fixtures: a published book with two chapters ----
    const bookInsert = await db.collection('books').insertOne({
      title: bookTitle,
      subject: 'English',
      grade: 'Class 3',
      language: 'en',
      publicationState: 'published',
      processingState: 'ready',
      chunkCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    bookId = bookInsert.insertedId.toString();
    const chunk = (chapterTitle: string, chapterOrder: number) => ({
      bookId: new ObjectId(bookId),
      chapterId: null,
      chapterTitle,
      chapterOrder,
      pageStart: chapterOrder * 10,
      pageEnd: chapterOrder * 10 + 2,
      text: `${chapterTitle} text`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.collection('book_chunks').insertMany([chunk('Chapter 1', 1), chunk('Chapter 2', 2)]);

    // ---- Accounts ----
    const admin = await call('POST', '/auth/login/admin', undefined, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const adminToken: string = admin.body?.tokens?.accessToken;
    check('admin can log in', admin.status === 200 && Boolean(adminToken), `status ${admin.status}`);

    const student = await registerAndLogin('student');
    const other = await registerAndLogin('other');
    check('student can register and log in', Boolean(student.token));

    const chapters = (await call('GET', `/practice/books/${bookId}/chapters`)).body.chapters as Array<{ id: string; title: string }>;
    const ch1 = chapters.find((c) => c.title === 'Chapter 1');
    const ch2 = chapters.find((c) => c.title === 'Chapter 2');
    check('student sees chapters of the selected book', chapters.length === 2 && Boolean(ch1 && ch2));
    if (!ch1 || !ch2) throw new Error('chapters missing');

    const books = (await call('GET', '/practice/books')).body.books as Array<{ _id: string }>;
    check('student sees published books', books.some((b) => b._id === bookId));

    // ---- Admin helpers ----
    const createSet = async (questionType: string, extra: Json = {}) => {
      const r = await call('POST', '/admin/practice/sets', adminToken, {
        title: `API test ${questionType} ${runId}`,
        bookId,
        chapters: [ch1.id, ch2.id],
        questionType,
        practiceModeEnabled: true,
        examModeEnabled: false,
        ...extra,
      });
      if (!r.body.set?._id) throw new Error(`create set failed: ${JSON.stringify(r.body)}`);
      return r.body.set._id as string;
    };
    const addQuestion = async (setId: string, question: Json) => {
      const r = await call('POST', `/admin/practice/sets/${setId}/questions`, adminToken, question);
      if (r.status >= 300) throw new Error(`add question failed: ${JSON.stringify(r.body)}`);
      return r.body.question;
    };
    const publish = async (setId: string) => {
      const r = await call('POST', `/admin/practice/sets/${setId}/publish`, adminToken);
      if (r.status >= 300) throw new Error(`publish failed: ${JSON.stringify(r.body)}`);
    };

    // ---- Draft isolation ----
    const draftId = await createSet('mcq', { title: `API test DRAFT ${runId}` });
    await addQuestion(draftId, { questionType: 'mcq', question: 'Draft only?', options: ['a', 'b'], correctIndex: 0, marks: 1, chapterId: ch1.id });
    check('draft set is hidden from students', (await call('GET', `/practice/sets/${draftId}`, student.token)).status === 404);
    const draftStart = await call('POST', '/practice/attempts', student.token, { bookId, questionType: 'mcq', mode: 'practice' });
    check('draft questions never reach a student attempt', !JSON.stringify(draftStart.body).includes('Draft only?'));

    // ---- Chapter-wise MCQ set with exam mode (1 minute timer) ----
    const mcqSet = await createSet('mcq', { examModeEnabled: true, examDurationMinutes: 1 });
    const q1 = await addQuestion(mcqSet, { questionType: 'mcq', question: 'Chapter 1 question?', options: ['Yes', 'No'], correctIndex: 0, marks: 1, chapterId: ch1.id });
    const q2 = await addQuestion(mcqSet, { questionType: 'mcq', question: 'Chapter 2 question?', options: ['Up', 'Down'], correctIndex: 1, marks: 2, chapterId: ch2.id });
    check('question keeps its chapter', q1.chapterId === ch1.id && q2.chapterId === ch2.id);
    const foreign = await call('POST', `/admin/practice/sets/${mcqSet}/questions`, adminToken, { questionType: 'mcq', question: 'X?', options: ['a', 'b'], correctIndex: 0, marks: 1, chapterId: 'not-a-chapter' });
    check('question with a chapter outside the set is rejected', foreign.status === 400);
    await publish(mcqSet);

    const chapterOnly = await call('POST', '/practice/attempts', student.token, { bookId, questionType: 'mcq', mode: 'practice', chapters: [ch2.id] });
    const chapterTitles = (chapterOnly.body.attempt?.questions ?? []).map((q: Json) => q.payload.question);
    check('chapter filter returns only the selected chapter', chapterOnly.status === 201 && chapterTitles.includes('Chapter 2 question?') && !chapterTitles.includes('Chapter 1 question?'));
    check('attempt belongs to the student', chapterOnly.body.attempt?.userId !== undefined && chapterOnly.body.attempt.userId.length === 24);
    check('no correct answer in an unsubmitted attempt', !JSON.stringify(chapterOnly.body.attempt?.questions).includes('correctIndex'));

    // ---- Practice: instant check, submit, duplicate protection ----
    const practiceId = chapterOnly.body.attempt._id as string;
    const q2Id = chapterOnly.body.attempt.questions.find((q: Json) => q.payload.question === 'Chapter 2 question?').questionId as string;
    const wrong = await call('POST', `/practice/attempts/${practiceId}/check`, student.token, { questionId: q2Id, value: { optionIndex: 0 } });
    check('instant check marks a wrong answer and shows the correct one', wrong.body.result?.correct === false && wrong.body.result?.correctAnswer === 'Down');
    const right = await call('POST', `/practice/attempts/${practiceId}/check`, student.token, { questionId: q2Id, value: { optionIndex: 1 } });
    check('instant check marks a right answer', right.body.result?.correct === true && right.body.result?.marksAwarded === 2);
    const submitted = await call('POST', `/practice/attempts/${practiceId}/submit`, student.token, [{ questionId: q2Id, value: { optionIndex: 1 } }]);
    const scored = submitted.body.attempt?.results?.find((r: Json) => r.questionId === q2Id);
    check('submit scores on the server', submitted.status === 200 && scored?.marksAwarded === 2);
    const again = await call('POST', `/practice/attempts/${practiceId}/submit`, student.token, [{ questionId: q2Id, value: { optionIndex: 0 } }]);
    check('duplicate submit is ignored', again.body.duplicate === true && again.body.attempt.obtainedMarks === submitted.body.attempt.obtainedMarks);
    check('no instant check after submit', (await call('POST', `/practice/attempts/${practiceId}/check`, student.token, { questionId: q2Id, value: { optionIndex: 0 } })).status === 409);
    check('no answer change after submit', (await call('POST', `/practice/attempts/${practiceId}/answers`, student.token, [{ questionId: q2Id, value: { optionIndex: 0 } }])).status === 409);

    // ---- Exam ----
    const exam = await call('POST', '/practice/attempts', student.token, { bookId, questionType: 'mcq', mode: 'exam', chapters: [ch1.id, ch2.id] });
    const examAttempt = exam.body.attempt;
    check('exam has a timer', examAttempt.durationMinutes === 1 && Boolean(examAttempt.expiresAt));
    check('exam hides answers before submit', !JSON.stringify(examAttempt.questions).includes('correctIndex'));
    check('exam blocks instant check', (await call('POST', `/practice/attempts/${examAttempt._id}/check`, student.token, { questionId: examAttempt.questions[0].questionId, value: { optionIndex: 0 } })).status === 400);
    check('exam requires every question answered', (await call('POST', `/practice/attempts/${examAttempt._id}/submit`, student.token, [])).status === 400);
    const examAnswers = examAttempt.questions.map((q: Json) => ({ questionId: q.questionId, value: { optionIndex: 0 } }));
    const examSubmit = await call('POST', `/practice/attempts/${examAttempt._id}/submit`, student.token, examAnswers);
    check('exam submit returns results with correct answers', examSubmit.status === 200 && examSubmit.body.attempt.results.every((r: Json) => r.correctAnswer !== undefined));

    const timed = await call('POST', '/practice/attempts', student.token, { bookId, questionType: 'mcq', mode: 'exam', chapters: [ch1.id, ch2.id] });
    const timedId = timed.body.attempt._id as string;
    check('another student cannot open this attempt', (await call('GET', `/practice/attempts/${timedId}`, other.token)).status === 404);
    console.log('waiting 65s for the exam timer to expire...');
    await sleep(65000);
    const expired = await call('GET', `/practice/attempts/${timedId}`, student.token);
    check('exam auto-submits when the timer expires', expired.body.attempt?.status === 'submitted' && expired.body.attempt?.autoSubmitted === true);
    check('no answers accepted after expiry', (await call('POST', `/practice/attempts/${timedId}/answers`, student.token, [{ questionId: timed.body.attempt.questions[0].questionId, value: { optionIndex: 0 } }])).status === 409);

    // ---- Authorisation ----
    check('student cannot use the admin practice API', (await call('GET', '/admin/practice/sets', student.token)).status === 403);

    // ---- All seven question types, correct answers score full marks ----
    const typeCases: Array<{ type: string; question: Json; value: (payload: Json) => unknown }> = [
      {
        type: 'fill_blank',
        question: { questionType: 'fill_blank', text: 'The {{1}} is big and {{2}} is red.', blanks: [{ accepted: ['sun'], marks: 1 }, { accepted: ['rose', 'flower'], marks: 1 }], marks: 2, chapterId: ch1.id },
        value: () => ({ blanks: ['Sun', ' flower '] }),
      },
      { type: 'true_false', question: { questionType: 'true_false', statement: 'The sky is blue.', correct: true, marks: 1, chapterId: ch1.id }, value: () => ({ value: true }) },
      {
        type: 'matching',
        question: { questionType: 'matching', left: ['cat', 'dog'], right: ['meow', 'woof'], pairs: [{ left: 'cat', right: 'meow' }, { left: 'dog', right: 'woof' }], marks: 2, chapterId: ch1.id },
        value: (payload) => {
          const left = Object.fromEntries(payload.left.map((i: Json) => [i.text, i.id]));
          const right = Object.fromEntries(payload.right.map((i: Json) => [i.text, i.id]));
          return { pairs: [{ leftId: left.cat, rightId: right.meow }, { leftId: left.dog, rightId: right.woof }] };
        },
      },
      { type: 'one_word', question: { questionType: 'one_word', question: 'Opposite of hot?', answer: 'cold', alternatives: ['chilly'], marks: 1, chapterId: ch1.id }, value: () => ({ text: '  COLD ' }) },
      {
        type: 'rearrange',
        question: { questionType: 'rearrange', items: ['I', 'am', 'happy'], marks: 1, chapterId: ch1.id },
        value: (payload) => {
          const id = Object.fromEntries(payload.items.map((i: Json) => [i.text, i.id]));
          return { order: [id.I, id.am, id.happy] };
        },
      },
      { type: 'translation', question: { questionType: 'translation', source: 'আমি ভাত খাই', sourceLanguage: 'bn', targetLanguage: 'en', answer: 'I eat rice', alternatives: ['I eat rice.'], marks: 1, chapterId: ch1.id }, value: () => ({ text: 'i eat rice' }) },
    ];

    for (const typeCase of typeCases) {
      const setId = await createSet(typeCase.type);
      await addQuestion(setId, typeCase.question);
      const formRows = (await call('GET', `/admin/practice/sets/${setId}/questions`, adminToken)).body.questions;
      const form = formRows?.[0];
      if (typeCase.type === 'matching') {
        check(
          'matching editor round-trips text pairs',
          Array.isArray(form?.pairs) && form.pairs[0]?.left === 'cat' && form.pairs[0]?.right === 'meow'
        );
      }
      if (typeCase.type === 'rearrange') {
        check(
          'rearrange editor round-trips the correct order',
          Array.isArray(form?.items) && form.items.join(' ') === 'I am happy',
          JSON.stringify(form?.items)
        );
      }
      await publish(setId);
      const started = await call('POST', '/practice/attempts', student.token, { bookId, questionType: typeCase.type, mode: 'practice', chapters: [ch1.id, ch2.id] });
      const question = started.body.attempt?.questions?.find((q: Json) => q.questionType === typeCase.type);
      if (started.status !== 201 || !question) {
        check(`${typeCase.type} can be started`, false, JSON.stringify(started.body).slice(0, 160));
        continue;
      }
      const submittedType = await call('POST', `/practice/attempts/${started.body.attempt._id}/submit`, student.token, [{ questionId: question.questionId, value: typeCase.value(question.payload) }]);
      const result = submittedType.body.attempt?.results?.find((r: Json) => r.questionId === question.questionId);
      check(`${typeCase.type} scores full marks`, result?.correct === true && result.marksAwarded === question.marks, result ? `${result.marksAwarded}/${question.marks}` : '');
    }

    // ---- Admin management ----
    const list = await call('GET', `/admin/practice/sets?bookId=${bookId}&status=published`, adminToken);
    const listed = list.body.sets.find((s: Json) => s._id === mcqSet);
    check('admin lists published sets with the creating admin recorded', Boolean(listed) && listed.createdBy !== '');
    check('admin list exposes draft/published state', listed?.draft === false && listed?.publicationState === 'published');

    const draftList = await call('GET', `/admin/practice/sets?bookId=${bookId}&status=draft`, adminToken);
    const listedDraft = draftList.body.sets.find((s: Json) => s._id === draftId);
    check('admin can filter draft sets', Boolean(listedDraft) && listedDraft.draft === true);

    const duplicate = await call('POST', `/admin/practice/sets/${mcqSet}/duplicate`, adminToken);
    const duplicateId = duplicate.body?.set?._id as string;
    const duplicateQuestions = (await call('GET', `/admin/practice/sets/${duplicateId}/questions`, adminToken)).body.questions ?? [];
    check('admin can duplicate a set with its questions', duplicate.status === 201 && duplicate.body.set.draft === true && duplicateQuestions.length >= 2);

    const currentQuestions = (await call('GET', `/admin/practice/sets/${mcqSet}/questions`, adminToken)).body.questions ?? [];
    const reversed = [...currentQuestions].reverse().map((q: Json) => String(q._id));
    const reorder = await call('PATCH', `/admin/practice/sets/${mcqSet}/questions/order`, adminToken, { questionIds: reversed });
    const reordered = (await call('GET', `/admin/practice/sets/${mcqSet}/questions`, adminToken)).body.questions ?? [];
    check(
      'admin can reorder questions',
      reorder.status === 200 && reordered.map((q: Json) => String(q._id)).join(',') === reversed.join(',')
    );

    const edit = await call('PATCH', `/admin/practice/sets/${mcqSet}`, adminToken, { title: `API test renamed ${runId}`, bookId, chapters: [ch1.id] });
    check('admin can change a set\'s chapters', edit.status === 200 && edit.body.set.chapters.length === 1);
  } finally {
    if (bookId) {
      const setIds = (await db.collection('practice_question_sets').find({ bookId: new ObjectId(bookId) }).project({ _id: 1 }).toArray()).map((s) => s._id);
      await db.collection('practice_attempts').deleteMany({ setId: { $in: setIds } });
      await db.collection('practice_questions').deleteMany({ setId: { $in: setIds } });
      await db.collection('practice_question_sets').deleteMany({ _id: { $in: setIds } });
      await db.collection('book_chunks').deleteMany({ bookId: new ObjectId(bookId) });
      await db.collection('books').deleteMany({ _id: new ObjectId(bookId) });
    }
    await mongo.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
