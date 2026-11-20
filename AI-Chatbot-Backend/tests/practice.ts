/**
 * Practice & Examination test suite (no network, no database).
 * Run: npx tsx tests/practice.ts
 * Covers: MCQ scoring, fill-in-the-blank normalization + partial marks,
 * true/false, matching pairs, one word, rearrange sequencing, translation
 * alternatives, negative marking, and unanswered handling.
 */
import { evaluateAttempt } from '../src/services/practice/attempt-evaluator.service';
import { normalizeAnswerText } from '../src/services/practice/normalize';

interface TestQuestion {
  questionId: string;
  questionType: 'mcq' | 'fill_blank' | 'true_false' | 'matching' | 'one_word' | 'rearrange' | 'translation';
  order: number;
  marks: number;
  payload: Record<string, unknown>;
  answer: Record<string, unknown>;
  alternatives?: string[];
}

function mcq(overrides: Partial<Record<string, unknown>> = {}): TestQuestion {
  return {
    questionId: 'q1',
    questionType: 'mcq',
    order: 1,
    marks: 1,
    payload: { question: 'What is the capital of Bangladesh?', options: ['Dhaka', 'Chittagong', 'Khulna', 'Rajshahi'] },
    answer: { correctIndex: 0 },
    ...overrides,
  } as TestQuestion;
}

function run(questions: TestQuestion[], answers: Array<{ questionId: string; value: unknown }>, negativeMarking = 0) {
  return evaluateAttempt(questions, answers, negativeMarking);
}

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

function main() {
  console.log('Practice normalization');
  check('trims and lowercases', normalizeAnswerText('  DhAkA  ') === 'dhaka');
  check('strips punctuation', normalizeAnswerText('Dhaka!') === 'dhaka');
  check('normalizes Bengali digits', normalizeAnswerText('১২') === '12');

  console.log('MCQ evaluation');
  const mcqOk = run([mcq()], [{ questionId: 'q1', value: { optionIndex: 0 } }]);
  check('correct MCQ awarded full marks', mcqOk.results[0].correct === true && mcqOk.results[0].marksAwarded === 1);
  check('MCQ percentage is 100', mcqOk.percentage === 100);

  const mcqWrong = run([mcq()], [{ questionId: 'q1', value: { optionIndex: 2 } }]);
  check('wrong MCQ awarded 0', mcqWrong.results[0].marksAwarded === 0 && mcqWrong.obtainedMarks === 0);

  console.log('True / False evaluation');
  const tfOk = run(
    [{ questionId: 'q2', questionType: 'true_false', order: 2, marks: 1, payload: { statement: 'The sky is blue.' }, answer: { value: true } }],
    [{ questionId: 'q2', value: { value: true } }]
  );
  check('true answer accepted', tfOk.results[0].correct === true);

  const tfBad = run(
    [{ questionId: 'q2', questionType: 'true_false', order: 2, marks: 1, payload: { statement: 'The sky is blue.' }, answer: { value: true } }],
    [{ questionId: 'q2', value: { value: false } }]
  );
  check('false answer rejected', tfBad.results[0].correct === false);

  console.log('Fill in the blanks');
  const fillOk = run(
    [
      {
        questionId: 'q3',
        questionType: 'fill_blank',
        order: 3,
        marks: 2,
        payload: { text: 'The cat {{1}} the dog.' },
        answer: { blanks: [{ accepted: ['sat'], marks: 1 }, { accepted: ['big'], marks: 1 }] },
      },
    ],
    [{ questionId: 'q3', value: { blanks: ['sat', 'big'] } }]
  );
  check('all blanks correct', fillOk.results[0].correct === true);
  check('fill blank total marks awarded', fillOk.results[0].marksAwarded === 2);

  const fillPartial = run(
    [
      {
        questionId: 'q3',
        questionType: 'fill_blank',
        order: 3,
        marks: 2,
        payload: { text: 'The cat {{1}} the dog.' },
        answer: { blanks: [{ accepted: ['sat'], marks: 1 }, { accepted: ['big'], marks: 1 }] },
      },
    ],
    [{ questionId: 'q3', value: { blanks: ['sat', 'small'] } }]
  );
  check('partial fill marks awarded', fillPartial.results[0].marksAwarded === 1);
  check('partial fill flagged incorrect', fillPartial.results[0].correct === false);

  console.log('Matching evaluation');
  const matchingPartial = run(
    [
      {
        questionId: 'q4',
        questionType: 'matching',
        order: 4,
        marks: 2,
        payload: { left: [{ id: 'l1', text: 'Dog' }, { id: 'l2', text: 'Cat' }], right: [{ id: 'r1', text: 'Puppy' }, { id: 'r2', text: 'Kitten' }] },
        answer: { pairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }] },
      },
    ],
    [{ questionId: 'q4', value: { pairs: [{ leftId: 'l1', rightId: 'r1' }] } }]
  );
  check('one matching pair correct', matchingPartial.results[0].marksAwarded === 1);
  check('matching partial flagged incorrect', matchingPartial.results[0].correct === false);

  console.log('One word / translation evaluation');
  const oneWord = run(
    [{ questionId: 'q5', questionType: 'one_word', order: 5, marks: 1, payload: { question: 'How many legs does a dog have?' }, answer: { accepted: ['four'] }, alternatives: ['4'] }],
    [{ questionId: 'q5', value: { text: ' Four ' } }]
  );
  check('one word + alternative accepted', oneWord.results[0].correct === true);

  const translation = run(
    [
      {
        questionId: 'q6',
        questionType: 'translation',
        order: 6,
        marks: 1,
        payload: { source: 'Good morning', sourceLanguage: 'en', targetLanguage: 'bn' },
        answer: { accepted: ['সুস্থ থাকুন'] },
        alternatives: ['সুস্থ হোন'],
      },
    ],
    [{ questionId: 'q6', value: { text: 'সুস্থ হোন' } }]
  );
  check('translation alternative accepted', translation.results[0].correct === true);

  console.log('Rearrange evaluation');
  const rearrange = run(
    [
      {
        questionId: 'q7',
        questionType: 'rearrange',
        order: 7,
        marks: 2,
        payload: { items: [{ id: 'r0', text: 'cat' }, { id: 'r1', text: 'the' }, { id: 'r2', text: 'sat' }] },
        answer: { order: ['r2', 'r0', 'r1'] },
      },
    ],
    [{ questionId: 'q7', value: { order: ['r2', 'r0', 'r1'] } }]
  );
  check('rearrange correct sequence accepted', rearrange.results[0].correct === true);

  console.log('Negative marking');
  const penalized = run([mcq()], [{ questionId: 'q1', value: { optionIndex: 1 } }], 25);
  check('negative marking applied for wrong answer', penalized.results[0].marksAwarded === -0.25);

  console.log('Attempt totals / unanswered');
  const total = run([mcq(), { ...mcq(), questionId: 'q2', questionType: 'true_false', payload: { statement: 's' }, answer: { value: true } }], []);
  check('unanswered questions counted', total.unansweredCount === 2 && total.totalQuestions === 2);
  check('zero score with no answers', total.obtainedMarks === 0 && total.percentage === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('Failures:', failures.join('; '));
    process.exit(1);
  }
}

main();
