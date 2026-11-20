import {
  AttemptEvaluation,
  MatchingItem,
  QuestionResult,
  QuestionSnapshot,
  ResultBreakdownItem,
} from './types';
import {
  isEmptyAnswer,
  normalizeAnswerText,
  roundMarks,
  sameStringArray,
} from './normalize';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberOr(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function matchingItems(value: unknown): MatchingItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const raw = record(item);
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `i${index}`,
        text: typeof raw.text === 'string' ? raw.text : '',
      };
    })
    .filter((item) => item.text.length > 0);
}

function acceptedAnswers(answer: unknown, alternatives?: unknown): string[] {
  const raw = record(answer);
  const list = stringArray(raw.accepted);
  const extra = stringArray(alternatives);
  return Array.from(new Set([...list, ...extra].map((item) => item.trim()).filter(Boolean)));
}

function textMatches(input: unknown, accepted: string[]): boolean {
  const normalized = normalizeAnswerText(input);
  if (!normalized) return false;
  return accepted.some((candidate) => normalizeAnswerText(candidate) === normalized);
}

function labelFor(items: MatchingItem[], id: unknown): string {
  const found = items.find((item) => item.id === id);
  return found ? found.text : '';
}

/**
 * Deterministically evaluates one question. Never uses an LLM - objective
 * questions are scored strictly against the stored answer / accepted
 * alternatives.
 */
export function evaluateQuestion(
  question: QuestionSnapshot,
  value: unknown,
  negativeMarkingPercent = 0
): QuestionResult {
  const marks = Math.max(0, numberOr(question.marks, 1));
  const payload = record(question.payload);
  const answer = record(question.answer);
  const breakdown: ResultBreakdownItem[] = [];

  let answered = !isEmptyAnswer(value);
  let correct = false;
  let awarded = 0;
  let correctAnswer: string | string[] = '';
  let studentAnswer: unknown = value ?? null;

  switch (question.questionType) {
    case 'mcq': {
      const options = stringArray(payload.options);
      const correctIndex = numberOr(answer.correctIndex, -1);
      const raw = record(value);
      const optionIndex = numberOr(raw.optionIndex, -1);
      answered = Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < options.length;
      correct = answered && optionIndex === correctIndex;
      awarded = correct ? marks : 0;
      correctAnswer = options[correctIndex] ?? '';
      studentAnswer = answered ? options[optionIndex] ?? '' : null;
      break;
    }

    case 'fill_blank': {
      const specs = Array.isArray(answer.blanks) ? answer.blanks : [];
      const studentBlanks = stringArray(record(value).blanks);
      const perBlank = specs.length > 0 ? marks / specs.length : 0;
      const allCorrect: boolean[] = [];

      specs.forEach((spec, index) => {
        const specRaw = record(spec);
        const accepted = stringArray(specRaw.accepted).filter(Boolean);
        const blankMarks = Math.max(0, numberOr(specRaw.marks, perBlank));
        const studentValue = studentBlanks[index] ?? '';
        const isCorrect = textMatches(studentValue, accepted);
        allCorrect.push(isCorrect);
        if (isCorrect) awarded += blankMarks;

        breakdown.push({
          label: `Blank ${index + 1}`,
          student: studentValue,
          correct: accepted[0] ?? '',
          correctFlag: isCorrect,
          marks: roundMarks(blankMarks),
          marksAwarded: roundMarks(isCorrect ? blankMarks : 0),
        });
      });

      answered = studentBlanks.some((blank) => normalizeAnswerText(blank).length > 0);
      correct = specs.length > 0 && allCorrect.every(Boolean);
      correctAnswer = specs.map((spec) => stringArray(record(spec).accepted)[0] ?? '');
      studentAnswer = studentBlanks;
      break;
    }

    case 'true_false': {
      const raw = record(value);
      const studentValue = typeof raw.value === 'boolean' ? raw.value : null;
      const correctValue = answer.value === true;
      answered = studentValue !== null;
      correct = answered && studentValue === correctValue;
      awarded = correct ? marks : 0;
      correctAnswer = correctValue ? 'True' : 'False';
      studentAnswer = studentValue === null ? null : studentValue ? 'True' : 'False';
      break;
    }

    case 'matching': {
      const left = matchingItems(payload.left);
      const right = matchingItems(payload.right);
      const correctPairs = Array.isArray(answer.pairs) ? answer.pairs : [];
      const studentPairs = Array.isArray(record(value).pairs) ? (record(value).pairs as unknown[]) : [];
      const studentMap = new Map<string, string>();
      studentPairs.forEach((pair) => {
        const raw = record(pair);
        if (typeof raw.leftId === 'string' && typeof raw.rightId === 'string') {
          studentMap.set(raw.leftId, raw.rightId);
        }
      });

      const perPair = correctPairs.length > 0 ? marks / correctPairs.length : 0;
      const allCorrect: boolean[] = [];

      correctPairs.forEach((pair, index) => {
        const raw = record(pair);
        const leftId = typeof raw.leftId === 'string' ? raw.leftId : '';
        const rightId = typeof raw.rightId === 'string' ? raw.rightId : '';
        const studentRightId = studentMap.get(leftId) ?? '';
        const isCorrect = Boolean(leftId) && studentRightId === rightId;
        allCorrect.push(isCorrect);
        if (isCorrect) awarded += perPair;

        breakdown.push({
          label: labelFor(left, leftId) || `Pair ${index + 1}`,
          student: labelFor(right, studentRightId),
          correct: labelFor(right, rightId),
          correctFlag: isCorrect,
          marks: roundMarks(perPair),
          marksAwarded: roundMarks(isCorrect ? perPair : 0),
        });
      });

      answered = studentMap.size > 0;
      correct = correctPairs.length > 0 && allCorrect.every(Boolean);
      correctAnswer = correctPairs.map((pair) => {
        const raw = record(pair);
        return `${labelFor(left, raw.leftId)} → ${labelFor(right, raw.rightId)}`;
      });
      studentAnswer = Array.from(studentMap.entries())
        .filter(([, rightId]) => Boolean(rightId))
        .map(([leftId, rightId]) => `${labelFor(left, leftId)} → ${labelFor(right, rightId)}`);
      break;
    }

    case 'one_word':
    case 'translation': {
      const accepted = acceptedAnswers(question.answer, question.alternatives);
      const raw = record(value);
      const studentText = typeof raw.text === 'string' ? raw.text : '';
      answered = normalizeAnswerText(studentText).length > 0;
      correct = textMatches(studentText, accepted);
      awarded = correct ? marks : 0;
      correctAnswer = accepted[0] ?? '';
      studentAnswer = answered ? studentText : null;
      break;
    }

    case 'rearrange': {
      const items = matchingItems(payload.items);
      const correctOrder = stringArray(answer.order);
      const studentOrder = stringArray(record(value).order);
      answered = studentOrder.length > 0;
      correct = correctOrder.length > 0 && sameStringArray(studentOrder, correctOrder);
      awarded = correct ? marks : 0;
      correctAnswer = correctOrder.map((id) => labelFor(items, id)).join(' ');
      studentAnswer = studentOrder.map((id) => labelFor(items, id)).join(' ');
      break;
    }

    default:
      // Unknown future type: never award marks silently.
      correct = false;
      awarded = 0;
      correctAnswer = '';
      break;
  }

  if (negativeMarkingPercent > 0 && answered && !correct && awarded === 0) {
    awarded = -roundMarks((marks * negativeMarkingPercent) / 100);
  }

  return {
    questionId: question.questionId,
    questionType: question.questionType,
    order: question.order,
    marks: roundMarks(marks),
    marksAwarded: roundMarks(Math.min(awarded, marks)),
    answered,
    correct,
    studentAnswer,
    correctAnswer,
    breakdown,
  };
}

/** Evaluates a whole attempt and aggregates totals. */
export function evaluateAttempt(
  questions: QuestionSnapshot[],
  answers: Array<{ questionId: string; value: unknown }>,
  negativeMarkingPercent = 0
): AttemptEvaluation {
  const answerMap = new Map<string, unknown>();
  answers.forEach((entry) => {
    answerMap.set(String(entry.questionId), entry.value);
  });

  const ordered = [...questions].sort((a, b) => a.order - b.order);
  const results = ordered.map((question) =>
    evaluateQuestion(question, answerMap.get(String(question.questionId)) ?? null, negativeMarkingPercent)
  );

  const totalMarks = roundMarks(results.reduce((sum, item) => sum + item.marks, 0));
  const obtainedMarks = roundMarks(Math.max(0, results.reduce((sum, item) => sum + item.marksAwarded, 0)));
  const correctCount = results.filter((item) => item.correct).length;
  const answeredCount = results.filter((item) => item.answered).length;

  return {
    results,
    totalQuestions: results.length,
    totalMarks,
    obtainedMarks,
    percentage: totalMarks > 0 ? roundMarks((obtainedMarks / totalMarks) * 100) : 0,
    correctCount,
    incorrectCount: answeredCount - correctCount,
    unansweredCount: results.length - answeredCount,
  };
}
