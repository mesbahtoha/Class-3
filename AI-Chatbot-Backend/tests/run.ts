/**
 * Class 3 tutor test suite (no network, no database).
 * Run: npx tsx tests/run.ts
 * Covers: Banglish detection/language rule, retrieval query forms, citation
 * validation, answer sanitization, lesson validation, provider allowlist +
 * mock provider, tutor contract schema, chunk page preservation, attachment
 * magic-byte validation, quiz schema validation.
 */
import { detectScript, decideAnswerLanguage, banglishVariants, retrievalQueryForms } from '../src/services/ai/banglish-normalizer.service';
import { sanitizeAnswerText, validateSources, validateLessonPlan, TutorResponseSchema, QuizPreviewSchema } from '../src/services/ai/response-validator.service';
import { buildTutorMessages } from '../src/services/ai/prompt-builder.service';
import { isAllowlisted, ALLOWLISTED_PROVIDERS } from '../src/services/ai/capabilities';
import providerRegistry from '../src/services/ai/provider-registry';
import {
  chunkBookPages,
  cleanPageTexts,
  detectChapters,
  isLowQualityText,
  isTableOfContents,
  parseTocEntries,
} from '../src/services/rag/document-extraction.service';
import { scoreChunksForTest, retrievalSufficient } from '../src/services/rag/retrieval.service';
import { normalizeDigits, normalizeForIndex, buildQueryTerms, contentTokens } from '../src/utils/text.utils';
import { storeChatAttachment, clearChatAttachments } from '../src/services/attachment.service';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed += 1;
    console.log(`  ok - ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL - ${name}${extra ? ` (${extra})` : ''}`);
  }
}

async function main() {
  console.log('Banglish / language rule');
  check('vognangsho detected as banglish', detectScript('vognangsho ki?') === 'banglish', detectScript('vognangsho ki?'));
  check('ei onko ta bujhao detected as banglish', detectScript('ei onko ta kivabe korbo?') === 'banglish');
  check('amar answer vul holo keno detected as banglish', detectScript('amar answer vul holo keno?') === 'banglish');
  check('pure Bangla detected as bn', detectScript('ভগ্নাংশ কী? সহজ করে বোঝাও') === 'bn');
  check('pure English detected as en', detectScript('What is a fraction?') === 'en');
  check('mixed detected as mixed', detectScript('ভগ্নাংশ ki?') === 'mixed');
  check('banglish -> bn by default', decideAnswerLanguage('banglish', undefined) === 'bn');
  check('banglish + auto -> bn', decideAnswerLanguage('banglish', 'auto') === 'bn');
  check('mixed -> bn by default', decideAnswerLanguage('mixed', undefined) === 'bn');
  check('pure bn -> bn', decideAnswerLanguage('bn', undefined) === 'bn');
  check('pure en + en pref -> en', decideAnswerLanguage('en', 'en') === 'en');
  check('vognangsho maps to ভগ্নাংশ variant', banglishVariants('vognangsho ki?').includes('ভগ্নাংশ'));
  const forms = retrievalQueryForms('vognangsho ki? easy kore bujhao');
  check('original query preserved first', forms[0] === 'vognangsho ki? easy kore bujhao', forms[0]);
  check('variant forms generated', forms.length > 1);

  console.log('Tutor prompt');
  const messages = buildTutorMessages({ question: 'vognangsho ki?', answerLanguage: 'bn', chunks: [], history: [] });
  const sys = String(messages[0].content);
  check('system prompt enforces Bengali script', /বাংলা হরফে/.test(sys));
  check('system prompt sets Class 3 level', /Class 3/.test(sys));
  check('system prompt warns about untrusted book data', /UNTRUSTED DATA/.test(sys));
  check('system prompt forbids inventing pages', /Never invent page numbers/.test(sys));

  console.log('Citations / sanitization / lessons');
  const good = [{ bookId: 'b1', bookTitle: 'গণিত', chunkId: 'c1', pageStart: 12, pageEnd: 13 }];
  const bad = [{ bookId: 'b1', bookTitle: 'গণিত', chunkId: 'INVENTED', pageStart: 999 }];
  const validated = validateSources([...good, ...bad] as never, new Set(['c1']));
  check('real chunk citation kept', validated.valid.length === 1 && validated.valid[0].chunkId === 'c1');
  check('fabricated chunk citation dropped', validated.dropped === 1);
  check('script tags stripped', !sanitizeAnswerText('hello <script>alert(1)</script> world').includes('<script>'));
  check('javascript: stripped', !sanitizeAnswerText('x javascript:alert(1)').includes('javascript:'));
  const lessonOk = validateLessonPlan({ lessonId: 'l1', title: 't', slides: [{ type: 'EXPLANATION', title: 'a', body: 'b' }] });
  check('valid lesson passes', Boolean(lessonOk));
  const lessonBad = validateLessonPlan({ lessonId: 'l1', title: 't', slides: [{ type: 'EVIL', title: 'a', body: 'b' }] });
  check('unknown slide type fails safely', lessonBad === undefined);

  console.log('Providers');
  check('5 adapters registered', providerRegistry.ids().length === 5, providerRegistry.ids().join(','));
  check('openrouter allowlisted model ok', isAllowlisted('openrouter', 'google/gemini-2.5-flash-lite'));
  check('openrouter slug pattern ok', isAllowlisted('openrouter', 'meta/llama-3.1-8b'));
  check('anthropic exact model ok', isAllowlisted('anthropic', 'claude-3-5-sonnet-20241022'));
  check('anthropic unknown model rejected', !isAllowlisted('anthropic', 'claude-99-evil'));
  check('unknown provider rejected', !isAllowlisted('nope', 'x'));
  check('allowlist non-empty', ALLOWLISTED_PROVIDERS.length >= 4);
  const mock = providerRegistry.get('mock')!;
  const gen = await mock.complete([{ role: 'user', content: 'vognangsho ki?' }]);
  check('mock answers in Bengali script', /[\u0980-\u09FF]/.test(gen.text));
  check('mock normalizes usage', gen.usage.totalTokens > 0);
  let streamed = '';
  for await (const chunk of mock.stream([{ role: 'user', content: 'hi' }])) {
    if (chunk.type === 'token') streamed += chunk.content;
  }
  check('mock streams tokens', streamed.length > 10);

  console.log('Chunking');
  const chunks = chunkBookPages([
    { pageIndex: 0, pageLabel: '1', text: Array(400).fill('ভগ্নাংশ').join(' ') },
    { pageIndex: 4, pageLabel: '5', text: Array(400).fill('যোগ').join(' ') },
  ]);
  check('chunks created', chunks.length >= 2);
  check('real page numbers preserved', chunks[0].pageStart === 1 && chunks[chunks.length - 1].pageStart === 5);

  console.log('Retrieval');
  check('Bengali digits normalized', normalizeDigits('১২৩') === '123');
  check('index normalization removes punctuation', normalizeForIndex('ভগ্নাংশ, ভাগ! ১/২') === 'ভগ্নাংশ ভাগ 1 2');
  check('stop words removed from content tokens', !contentTokens('ভগ্নাংশ কী এবং কেন').includes('এবং'));
  check('single math digits kept as tokens', contentTokens('১/২ কী?').includes('1') && contentTokens('১/২ কী?').includes('2'));
  const expanded = buildQueryTerms('gonit ki?', retrievalQueryForms('gonit ki?'));
  check('Banglish query expands to Bengali topic', expanded.some((term) => term.term === 'গণিত'));
  check('original terms keep higher weight', expanded.find((term) => term.term === 'gonit')!.weight >= 1);
  const ranking = scoreChunksForTest(
    [
      { text: 'গাছের অংশ মূল, কাণ্ড, পাতা, ফুল ও ফল।' },
      { text: 'ভগ্নাংশ মানে সমান ভাগ। এককের উপর ভাগের সংখ্যা লেখা হয়।' },
      { text: 'পানি দিয়ে আমরা খাই, ধুই ও রান্না করি।' },
    ],
    'ভগ্নাংশ কী?'
  );
  check('BM25 ranks the relevant Bengali chunk first', ranking[0].index === 1, JSON.stringify(ranking));
  const rankingBanglish = scoreChunksForTest(
    [
      { text: 'গাছের অংশ মূল, কাণ্ড, পাতা, ফুল ও ফল।' },
      { text: 'ভগ্নাংশ মানে সমান ভাগ। এককের উপর ভাগের সংখ্যা লেখা হয়।' },
    ],
    'vognangsho ki?'
  );
  check('Banglish query finds the Bengali chunk', rankingBanglish[0].index === 1, JSON.stringify(rankingBanglish));
  const strongChunk = {
    chunkId: 'c1', bookId: 'b1', bookTitle: 'গণিত', text: 'ভগ্নাংশ',
    score: 8, matchedOriginal: 1, matchedTotal: 2, coverage: 1, queryOriginalCount: 1,
  };
  check('single strong topic match is sufficient', retrievalSufficient([strongChunk]));
  check(
    'two-of-three term match is sufficient',
    retrievalSufficient([{ ...strongChunk, coverage: 0.3333, matchedOriginal: 1, matchedTotal: 1, queryOriginalCount: 3, score: 4.2 }])
  );
  check('weak match is not sufficient', !retrievalSufficient([{ ...strongChunk, score: 0.5, matchedTotal: 0 }]));
  check('TOC detected by dotted leaders', isTableOfContents('সূচিপত্র\nঅধ্যায় ১ ........ ৫\nঅধ্যায় ২ ........ ১২\nঅধ্যায় ৩ ........ ২০\nঅধ্যায় ৪ ........ ২৮\nঅধ্যায় ৫ ........ ৩৫'));
  const cleanedPages = cleanPageTexts([
    { pageIndex: 0, pageLabel: '1', text: 'আমার বাংলা বই\nক' },
    { pageIndex: 1, pageLabel: '2', text: 'আমার বাংলা বই\nভগ্নাংশ মানে সমান ভাগ।' },
    { pageIndex: 2, pageLabel: '3', text: 'আমার বাংলা বই\nযোগ মানে একসাথে করা।' },
    { pageIndex: 3, pageLabel: '4', text: 'আমার বাংলা বই\nগুণ মানে বারবার যোগ।' },
  ]);
  check('repeated header removed from pages', !cleanedPages[1].text.includes('আমার বাংলা বই'));
  check('mojibake text rejected', isLowQualityText('wR †kvbv I ejvi my‡hvM K‡i †`‡eb cvV ̈cy ̄Í‡Ki Qov KweZv Mí'));
  check('refusal text rejected', isLowQualityText('The image contains a large amount of visual noise and artifacts, making it impossible to extract text.'));
  check('repeated filename loop rejected', isLowQualityText(Array(30).fill('Class-3, Science.').join(' ')));
  check('repeated math numbers accepted', !isLowQualityText(Array(40).fill('১০০০ ১০০ ১০০০ ১০০').join(' ')));
  check('normal Bengali prose accepted', !isLowQualityText('গণপ্রজাতন্ত্রী বাংলাদেশের জাতীয় পতাকায় সবুজ ক্ষেত্রের উপর রক্তবর্ণের একটি বৃত্ত থাকবে।'));
  const chaptered = detectChapters(
    [
      { pageIndex: 0, pageLabel: '1', text: 'Cover page' },
      { pageIndex: 1, pageLabel: '2', text: 'অধ্যায় ১ : ভগ্নাংশ\nভগ্নাংশ মানে সমান ভাগ।' },
      { pageIndex: 2, pageLabel: '3', text: 'যোগ এর বিষয়।' },
    ],
    (_title, order) => `chapter-${order}`
  );
  check('chapter IDs assigned to following pages', chaptered[2].chapterId === 'chapter-1');
  check('pre-chapter pages marked front matter', chaptered[0].pageType === 'front');
  const ordinal = detectChapters(
    [{ pageIndex: 0, pageLabel: '1', text: 'প্রথম অধ্যায়\nস্রষ্টা ও সৃষ্টি\nমহান আল্লাহর অস্তিত্ব।' }],
    (_title, order) => `ch-${order}`
  );
  check('ordinal Bengali chapter heading detected', ordinal[0].chapterOrder === 1 && ordinal[0].chapterTitle.includes('স্রষ্টা'));
  const frontChunks = chunkBookPages([
    { pageIndex: 0, pageLabel: '1', text: 'আমার বাংলা বই) রণ ্ ঙ 4)৮! লীগ ৮৫. / £-.১', pageType: 'front' },
    { pageIndex: 1, pageLabel: '2', text: Array(60).fill('গণপ্রজাতন্ত্রী বাংলাদেশের জাতীয় পতাকা').join(' ') + '।', pageType: 'front' },
  ]);
  check(
    'substantive front matter stays searchable, cover noise dropped',
    frontChunks.length > 0 && frontChunks.every((chunk) => chunk.pageStart === 2)
  );

  console.log('Table of contents');
  const tocEntries = parseTocEntries(
    'সূচিপত্র\nপাঠ শিরোনাম পৃষ্ঠা\n১ আমাদের কথা ১\n২ আমাদের পরিবার ২\n৩ ময়লার বাক্সো ৩'
  );
  check('TOC entries parsed in order', tocEntries.length === 3 && tocEntries[1].title === 'আমাদের পরিবার', JSON.stringify(tocEntries));
  const tocMapped = detectChapters(
    [
      { pageIndex: 0, pageLabel: '1', text: 'সূচিপত্র\nপাঠ শিরোনাম পৃষ্ঠা\n১ আমাদের কথা ১\n২ আমাদের পরিবার ২\n৩ ময়লার বাক্সো ৩' },
      { pageIndex: 1, pageLabel: '2', text: 'পাঠ ১\nআমাদের কথা\nআজ স্কুলের প্রথম দিন।' },
      { pageIndex: 2, pageLabel: '3', text: 'পাঠ ২\nআমাদের পরিবার\nমিতুরা দুই বোন।' },
      { pageIndex: 3, pageLabel: '4', text: 'পাঠ ৩\nময়লার বাক্সো\nকলার খোসা ফেলতে হবে।' },
    ],
    (_title, order) => `ch-${order}`
  );
  check('TOC drives chapter mapping', tocMapped[1].chapterTitle === 'আমাদের কথা' && tocMapped[2].chapterOrder === 2);
  check('TOC page excluded from chapters', tocMapped[0].pageType === 'toc');
  check('TOC mapping gives ids', tocMapped[3].chapterId === 'ch-3');
  const badTocMapped = detectChapters(
    [
      { pageIndex: 0, pageLabel: '1', text: 'সূচিপত্র\n১ কখ ১\n২ খগ ২\n৩ গঘ ২' },
      { pageIndex: 1, pageLabel: '2', text: 'পাঠ ১\nকখ\nআজ স্কুলে যাব।' },
      { pageIndex: 2, pageLabel: '3', text: 'পাঠ ২\nখগ\nআমার পরিবার।' },
      { pageIndex: 3, pageLabel: '4', text: 'পাঠ ৩\nগঘ\nআমার বাড়ি।' },
    ],
    (_title, order) => `ch-${order}`
  );
  check('inconsistent TOC page numbers are not trusted', badTocMapped[2].chapterOrder === 2 && badTocMapped[2].chapterId === 'ch-2');
  check('clean TOC titles are used with heading starts', badTocMapped[2].chapterTitle === 'খগ');

  console.log('Tutor contract');
  const contract = {
    answer: 'ভগ্নাংশ মানে সমান ভাগ।',
    answerLanguage: 'bn',
    answerStatus: 'ANSWERED',
    sources: [{ bookId: 'b1', bookTitle: 'গণিত', chunkId: 'c1', pageStart: 3 }],
    followUpQuestion: 'এবার তুমি চেষ্টা করো!',
    requestId: 'r1',
  };
  check('valid TutorResponse passes', TutorResponseSchema.safeParse(contract).success);
  const empty = { ...contract, answer: '' };
  check('empty answer rejected', !TutorResponseSchema.safeParse(empty).success);

  console.log('Attachments / quiz');
  const realPng = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16, 0),
  ]);
  let storedOk = false;
  try {
    const meta = storeChatAttachment({ buffer: realPng, mimeType: 'image/png', originalName: 'photo.png', userId: 'u1' });
    storedOk = meta.type === 'image' && meta.size === realPng.length;
  } catch { storedOk = false; }
  check('real PNG bytes accepted', storedOk);
  let spoofRejected = false;
  try {
    storeChatAttachment({ buffer: Buffer.from('MZ executable, not an image at all....'), mimeType: 'image/png', originalName: 'evil.png', userId: 'u1' });
  } catch (e) { spoofRejected = (e as Error & { statusCode?: number }).statusCode === 422; }
  check('spoofed PNG rejected with 422', spoofRejected);
  let pdfOk = false;
  try {
    const meta = storeChatAttachment({ buffer: Buffer.concat([Buffer.from('%PDF-1.4 fake'), Buffer.alloc(16, 0)]), mimeType: 'application/pdf', originalName: 'doc.pdf', userId: 'u1' });
    pdfOk = meta.type === 'pdf';
  } catch { pdfOk = false; }
  check('real PDF signature accepted', pdfOk);
  clearChatAttachments();
  const quizOk = QuizPreviewSchema.safeParse({ question: '১/২ + ১/২ = ?', options: ['১', '২', '১/৪'], answerIndex: 0 });
  check('valid quiz passes', quizOk.success);
  check('single-option quiz rejected', !QuizPreviewSchema.safeParse({ question: 'q?', options: ['only'], answerIndex: 0 }).success);
  check('out-of-range answerIndex rejected', !QuizPreviewSchema.safeParse({ question: 'q?', options: ['a', 'b'], answerIndex: 5 }).success);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('Failures:', failures.join('; '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test runner crashed:', error);
  process.exit(1);
});
