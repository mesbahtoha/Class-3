import type { PracticeQuestionType } from '../../constants';

/** Domain error that the central error middleware turns into a JSON response. */
export class PracticeError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'PracticeError';
    this.statusCode = statusCode;
  }
}

export interface ChapterRef {
  id: string;
  title: string;
  order: number;
}

/* ------------------------------------------------------------------ */
/* Question payload / answer contracts                                 */
/* ------------------------------------------------------------------ */

export interface McqPayload {
  question: string;
  options: string[];
}

export interface McqAnswer {
  correctIndex: number;
}

export interface FillBlankPayload {
  text: string;
}

export interface FillBlankSpec {
  accepted: string[];
  marks?: number;
}

export interface FillBlankAnswer {
  blanks: FillBlankSpec[];
}

export interface TrueFalsePayload {
  statement: string;
}

export interface TrueFalseAnswer {
  value: boolean;
}

export interface MatchingItem {
  id: string;
  text: string;
}

export interface MatchingPayload {
  left: MatchingItem[];
  right: MatchingItem[];
}

export interface MatchingPair {
  leftId: string;
  rightId: string;
}

export interface MatchingAnswer {
  pairs: MatchingPair[];
}

export interface OneWordPayload {
  question: string;
}

export interface TextAnswer {
  accepted: string[];
}

export interface RearrangePayload {
  items: MatchingItem[];
}

export interface RearrangeAnswer {
  order: string[];
}

export interface TranslationPayload {
  source: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

/* ------------------------------------------------------------------ */
/* Student answer contracts                                            */
/* ------------------------------------------------------------------ */

export interface StudentAnswers {
  [questionId: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export interface QuestionSnapshot {
  questionId: string;
  questionType: PracticeQuestionType;
  order: number;
  marks: number;
  chapterId?: string;
  chapterTitle?: string;
  payload: unknown;
  answer: unknown;
  alternatives?: string[];
}

export interface ResultBreakdownItem {
  label: string;
  student: string;
  correct: string;
  correctFlag: boolean;
  marks: number;
  marksAwarded: number;
}

export interface QuestionResult {
  questionId: string;
  questionType: PracticeQuestionType;
  order: number;
  marks: number;
  marksAwarded: number;
  answered: boolean;
  correct: boolean;
  studentAnswer: unknown;
  correctAnswer: string | string[];
  breakdown: ResultBreakdownItem[];
}

export interface AttemptEvaluation {
  results: QuestionResult[];
  totalQuestions: number;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
}
