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
import { chunkBookPages } from '../src/services/rag/document-extraction.service';
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
