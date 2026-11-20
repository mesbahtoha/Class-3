import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage, getPracticeAttempt, savePracticeAnswers, submitPracticeAnswers } from '@/lib/api';
import { SkeletonBox } from '@/components/ui/Skeleton';
import type { AttemptQuestion, PracticeAttempt, QuestionResult, StudentQuestionPayload } from '@/types';

function payloadText(payload: StudentQuestionPayload): string {
  const p = payload as unknown as Record<string, unknown>;
  if (typeof p.question === 'string') return p.question;
  if (typeof p.statement === 'string') return p.statement;
  if (typeof p.source === 'string') return p.source;
  if (typeof p.text === 'string') return p.text;
  return '';
}

function payloadOptions(payload: StudentQuestionPayload): string[] {
  const p = payload as unknown as Record<string, unknown>;
  if (Array.isArray(p.options)) return p.options.map((option) => String(option));
  return [];
}

function correctOptionInRange(options: string[], correctIndex: number): boolean {
  return correctIndex >= 0 && correctIndex < options.length;
}

function splitFillBlanks(text: string): string[] {
  const parts = text.split(/\{\{(\d+)\}\}/);
  const blanks: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    blanks.push(parts[index] ?? '');
  }
  return blanks;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function PracticeAttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const answersRef = useRef<Record<string, unknown>>({});
  answersRef.current = answers;

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getPracticeAttempt(attemptId);
      setAttempt(response.attempt);
      const nextAnswers: Record<string, unknown> = {};
      response.attempt.answers.forEach((entry) => {
        nextAnswers[String(entry.questionId)] = entry.value;
      });
      setAnswers(nextAnswers);
      answersRef.current = nextAnswers;
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (nextAnswersOverride?: Record<string, unknown>) => {
    if (!attemptId) return;
    const source = nextAnswersOverride ?? answersRef.current;
    const entries = Object.entries(source).map(([questionId, value]) => ({ questionId, value }));
    try {
      const response = await savePracticeAnswers(attemptId, entries);
      if (response.autoSubmitted) await load();
      return response.attempt;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    }
  }, [attemptId, load]);

  const submit = useCallback(async () => {
    if (!attemptId) return;
    setSubmitting(true);
    try {
      const entries = Object.entries(answersRef.current).map(([questionId, value]) => ({ questionId, value }));
      const response = await submitPracticeAnswers(attemptId, entries);
      if (response.autoSubmitted) {
        // Timer expired while confirming - just rehydrate the auto-submitted attempt.
        await load();
        return;
      }
      setAttempt(response.attempt);
      toast.success(response.duplicate ? 'Your exam was already submitted.' : 'Submitted successfully!');
      return response.attempt;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, load]);

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  // Auto-save drafts (exam) - skip the initial hydration write.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (loading || !attempt) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void save();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [answers, attempt, loading, save]);

  const questions = useMemo(() => attempt?.questions ?? [], [attempt]);
  const isExam = attempt?.mode === 'exam';

  const mm = useMemo(() => {
    if (!attempt?.expiresAt) return null;
    const expires = new Date(attempt.expiresAt).getTime();
    const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
    return formatClock(remaining);
  }, [attempt?.expiresAt, attempt?.status, attempt]);

  const mmSeconds = useMemo(() => {
    if (!attempt?.expiresAt) return null;
    const expires = new Date(attempt.expiresAt).getTime();
    return Math.max(0, Math.floor((expires - Date.now()) / 1000));
  }, [attempt?.expiresAt, attempt?.status, attempt]);

  // Auto-submit when the exam timer expires.
  useEffect(() => {
    if (!isExam || !attempt || attempt.status === 'submitted' || !mmSeconds) return;
    if (mmSeconds <= 0) {
      void submit();
    }
  }, [isExam, attempt, mmSeconds, submit]);

  if (loading) {
    return (
      <div className="pg-app" style={{ paddingBottom: 72 }}>
        <div className="pg-container" style={{ maxWidth: 860, paddingTop: 28 }}>
          <SkeletonBox width="40%" height={22} />
          <SkeletonBox width="60%" height={34} style={{ margin: '10px 0 20px' }} />
          <SkeletonBox width="100%" height={120} />
          <SkeletonBox width="100%" height={120} />
        </div>
      </div>
    );
  }

  if (loadError || !attempt) {
    return (
      <div className="pg-app" style={{ paddingBottom: 72 }}>
        <div className="pg-container" style={{ maxWidth: 640, paddingTop: 48 }}>
          <EmptyState icon="🧭" title="Practice session not found" description={loadError ?? 'Please start a new practice session.'} />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/practice"><Button variant="secondary">Back to practice</Button></Link>
          </div>
        </div>
      </div>
    );
  }


  function isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((key) => {
        const child = record[key];
        const text = Array.isArray(child) ? child.map((c) => String(c ?? '')).join(',') : String(child ?? '');
        return String(text ?? '').trim().length > 0;
      });
      return keys.length === 0;
    }
    return String(value).trim().length === 0;
  }

  const answeredQuestions = questions.filter((question) => {
    const answer = attempt.answers.find((entry) => String(entry.questionId) === question.questionId);
    return answer ? !isEmptyValue(answer.value) : false;
  }).length;

  const unansweredQuestions = questions.filter((question) => {
    const answer = attempt.answers.find((entry) => String(entry.questionId) === question.questionId);
    return !answer || isEmptyValue(answer.value);
  }).length;

  const mmDisplay = mm;

  if (attempt.status === 'submitted') {
    return <AttemptResults attempt={attempt} answers={answers} questions={questions} onRetake={() => navigate('/practice')} />;
  }

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 980, paddingTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 26, margin: 0 }}>{attempt.title}</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              {attempt.bookTitle} · {attempt.questionType.replace('_', ' ')} · Mode: {attempt.mode}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {mmDisplay && (
              <Badge variant={mmSeconds !== null && mmSeconds <= 60 ? 'danger' : 'warning'}>⏱ {mmDisplay} left</Badge>
            )}
            <Badge variant="info">{answeredQuestions}/{questions.length} answered</Badge>
          </div>
        </div>

        <div className="progress-track" style={{ height: 10, borderRadius: 999, background: 'var(--surface-cream)', margin: '14px 0', overflow: 'hidden' }}>
          <div className="progress-fill" style={{ height: 100, background: 'var(--accent-candy)', width: '100%' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {questions.map((question, index) => (
              <AttemptQuestionCard
                key={question.questionId}
                question={question}
                index={index}
                value={attempt.answers.find((entry) => String(entry.questionId) === question.questionId)?.value}
                onChange={(value) => setAnswer(question.questionId, value)}
                showFeedback={attempt.mode === 'practice'}
              />
            ))}
          </div>

          <div className="pg-card" style={{ alignSelf: 'start', padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Answer sheet</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {questions.map((question, index) => {
                const answered = !!attempt.answers.find((entry) => String(entry.questionId) === question.questionId) && !isEmptyValue(attempt.answers.find((entry) => String(entry.questionId) === question.questionId)?.value);
                return (
                  <button
                    key={question.questionId}
                    type="button"
                    className="pg-btn-secondary"
                    style={{ justifyContent: 'flex-start', opacity: answered ? 1 : 0.65 }}
                    onClick={() => document.getElementById(`attempt-q-${question.questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    {index + 1}. {payloadText(question.payload).slice(0, 40)}
                  </button>
                );
              })}
            </div>
            <Button onClick={() => setShowSubmitConfirm(true)} loading={submitting}>
              {isExam ? 'Submit exam' : 'Submit answers'}
            </Button>
            {!isExam && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 10 }}>Practice mode lets you review after submitting.</p>}
            {isExam && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 10 }}>Exam mode requires all questions to be answered unless the admin allowed unanswered ones.</p>}
          </div>
        </div>
      </div>

      <Modal
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        title="Submit before leaving?"
        maxWidth={420}
      >
        <p>
          You have answered <strong>{answeredQuestions}</strong> of <strong>{questions.length}</strong> questions.
          {unansweredQuestions > 0 ? (
            <>
              {' '}
              There are <strong>{unansweredQuestions}</strong> unanswered question(s) left.
              {attempt.allowUnanswered ? ' The exam allows unanswered questions.' : ' Unanswered questions may not receive marks.'}
            </>
          ) : (
            ' All questions are answered.'
          )}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)}>Keep answering</Button>
          <Button onClick={() => void submit()} loading={submitting}>Submit now</Button>
        </div>
      </Modal>
    </div>
  );
}

interface AttemptQuestionCardProps {
  question: AttemptQuestion;
  index: number;
  value: unknown;
  onChange: (value: unknown) => void;
  /** In practice mode, MCQ answers show immediate Correct/Incorrect feedback when clicked. */
  showFeedback?: boolean;
}

function AttemptQuestionCard({ question, index, value, onChange, showFeedback = false }: AttemptQuestionCardProps) {
  const id = `attempt-q-${question.questionId}`;
  const current = (value ?? {}) as Record<string, unknown>;

  let content: ReactNode = null;

  switch (question.questionType) {
    case 'mcq': {
      const options = payloadOptions(question.payload);
      const selectedIndex = typeof current.optionIndex === 'number' ? current.optionIndex : null;
      const answerPayload = (question.answer ?? {}) as Record<string, unknown>;
      const correctIndex = typeof answerPayload.correctIndex === 'number' ? answerPayload.correctIndex : null;
      const mcqFeedback = showFeedback && selectedIndex !== null;
      const mcqCorrect = correctIndex !== null && selectedIndex === correctIndex;
      const correctOption = correctIndex !== null && correctOptionInRange(options, correctIndex) ? options[correctIndex] : null;
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((option, optionIndex) => {
            const isCorrectOption = mcqFeedback && correctIndex === optionIndex;
            return (
              <button
                key={option}
                type="button"
                className="pg-btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  borderColor: selectedIndex === optionIndex ? 'var(--accent-candy)' : isCorrectOption ? 'var(--success-text)' : undefined,
                  background: selectedIndex === optionIndex ? 'var(--surface-mint-soft)' : isCorrectOption ? 'var(--surface-warn)' : undefined,
                }}
                onClick={() => onChange({ optionIndex })}
              >
                {mcqCorrect && correctIndex === optionIndex ? '✔ ' : ''}
                {option}
              </button>
            );
          })}
          {mcqFeedback && (
            <div
              style={{
                marginTop: 4,
                fontWeight: 800,
                fontSize: 13,
                color: mcqCorrect ? 'var(--success-text)' : 'var(--danger-text)',
              }}
            >
              {mcqCorrect ? '✔ Correct! Great choice.' : `✖ Incorrect. Correct answer: ${correctOption ?? 'N/A'}`}
            </div>
          )}
        </div>
      );
      break;
    }

    case 'fill_blank': {
      const blanks = splitFillBlanks(payloadText(question.payload));
      const studentBlanks = Array.isArray((current as { blanks?: string[] }).blanks) ? ((current as { blanks?: string[] }).blanks as string[]) : blanks.map(() => '');
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{payloadText(question.payload)}</p>
          {blanks.map((_, blankIndex) => (
            <input
              key={blankIndex}
              className="input"
              style={{ maxWidth: 320 }}
              placeholder={`Answer ${blankIndex + 1}`}
              value={studentBlanks[blankIndex] ?? ''}
              onChange={(event) => {
                const next = [...studentBlanks];
                next[blankIndex] = event.target.value;
                onChange({ blanks: next });
              }}
            />
          ))}
        </div>
      );
      break;
    }

    case 'true_false': {
      content = (
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="pg-btn-secondary" style={{ flex: 1 }} onClick={() => onChange({ value: true })}>True</button>
          <button type="button" className="pg-btn-secondary" style={{ flex: 1 }} onClick={() => onChange({ value: false })}>False</button>
        </div>
      );
      break;
    }

    case 'matching': {
      const left = Array.isArray((question.payload as { left?: Array<{ id: string; text: string }> }).left)
        ? ((question.payload as { left: Array<{ id: string; text: string }> }).left ?? [])
        : [];
      const right = Array.isArray((question.payload as { right?: Array<{ id: string; text: string }> }).right)
        ? ((question.payload as { right: Array<{ id: string; text: string }> }).right ?? [])
        : [];
      const pairs = Array.isArray((current as { pairs?: Array<{ leftId: string; rightId: string }> }).pairs)
        ? ((current as { pairs: Array<{ leftId: string; rightId: string }> }).pairs ?? [])
        : [];
      const selectedLeftId = typeof current.leftId === 'string' ? current.leftId : null;
      const selectedRightId = typeof current.rightId === 'string' ? current.rightId : null;

      const setPair = (leftId: string, rightId: string) => {
        const next = pairs.filter((pair) => pair.leftId !== leftId);
        next.push({ leftId, rightId });
        onChange({ pairs: next });
      };
      const removePair = (leftId: string) => {
        onChange({ pairs: pairs.filter((pair) => pair.leftId !== leftId) });
      };

      content = (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{payloadText(question.payload)}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <strong>Column A</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {left.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="pg-btn-secondary"
                    style={{ justifyContent: 'flex-start', borderColor: selectedLeftId === item.id ? 'var(--accent-candy)' : undefined, background: selectedLeftId === item.id ? 'var(--surface-mint-soft)' : undefined }}
                    onClick={() => onChange({ leftId: item.id, rightId: null })}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Column B</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {right.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="pg-btn-secondary"
                    style={{ justifyContent: 'flex-start', borderColor: selectedRightId === item.id ? 'var(--accent-candy)' : undefined, background: selectedRightId === item.id ? 'var(--surface-pink-soft)' : undefined }}
                    onClick={() => {
                      if (selectedLeftId) setPair(selectedLeftId, item.id);
                    }}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pairs.map((pair) => {
              const leftItem = left.find((item) => item.id === pair.leftId);
              const rightItem = right.find((item) => item.id === pair.rightId);
              return (
                <span key={pair.leftId} className="pg-chip">
                  {leftItem?.text} → {rightItem?.text}{' '}
                  <button type="button" aria-label="Remove match" onClick={() => removePair(pair.leftId)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800 }}>
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      );
      break;
    }

    case 'one_word':
    case 'translation': {
      const text = typeof current.text === 'string' ? current.text : '';
      content = (
        <div>
          <textarea
            className="textarea"
            rows={3}
            value={text}
            onChange={(event) => onChange({ text: event.target.value })}
            placeholder="Type your answer here…"
          />
        </div>
      );
      break;
    }

    case 'rearrange': {
      const items = Array.isArray((question.payload as { items?: Array<{ id: string; text: string }> }).items)
        ? ((question.payload as { items: Array<{ id: string; text: string }> }).items ?? [])
        : [];
      const order = Array.isArray((current as { order?: string[] }).order) ? ((current as { order: string[] }).order ?? []) : items.map((item) => item.id);
      const move = (index: number, direction: -1 | 1) => {
        const next = [...order];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange({ order: next });
      };
      content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, index) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, minWidth: 24 }}>{index + 1}.</span>
              <span style={{ flex: 1 }}>{item.text}</span>
              <button type="button" className="pg-btn-secondary" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" className="pg-btn-secondary" disabled={index === order.length - 1} onClick={() => move(index, 1)}>↓</button>
            </div>
          ))}
        </div>
      );
      break;
    }

    default:
      content = <p>Type your answer above.</p>;
  }

  return (
    <div className="pg-card" id={id} style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong>Question {index + 1} · {question.questionType.replace('_', ' ')}</strong>
        <Badge variant={question.marks > 0 ? 'info' : 'muted'}>{question.marks} mark(s)</Badge>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{payloadText(question.payload)}</div>
      {content}
    </div>
  );
}

interface AttemptResultsProps {
  attempt: PracticeAttempt;
  answers: Record<string, unknown>;
  questions: AttemptQuestion[];
  onRetake: () => void;
}

function AttemptResults({ attempt, answers, questions, onRetake }: AttemptResultsProps) {
  const results = attempt.results ?? [];
  const obtained = attempt.obtainedMarks ?? 0;
  const total = attempt.totalMarks ?? 0;
  const percentage = attempt.percentage ?? 0;

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 860, paddingTop: 28 }}>
        <div className="pg-card pg-card-mint-shadow" style={{ padding: 24, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 30 }}>{attempt.mode === 'exam' ? 'Exam result' : 'Practice result'}</h1>
          <div style={{ fontSize: 56, fontWeight: 900, margin: '12px 0' }}>{percentage}%</div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            You obtained <strong>{obtained}</strong> out of <strong>{total}</strong> marks.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <Badge variant="success">Correct: {attempt.correctCount ?? results.filter((r) => r.correct).length}</Badge>
            <Badge variant="danger">Incorrect: {attempt.incorrectCount ?? results.filter((r) => !r.correct).length}</Badge>
            <Badge variant="muted">Unanswered: {attempt.unansweredCount ?? results.filter((r) => !r.answered).length}</Badge>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
          {results.map((result: QuestionResult, index: number) => {
            const question = questions.find((q) => q.questionId === result.questionId);
            const studentAnswer = (answers[result.questionId] ?? null) as Record<string, unknown> | null;
            const answerText = formatStudentAnswer(result, studentAnswer, question);
            const correctAnswer = Array.isArray(result.correctAnswer) ? result.correctAnswer.join(' · ') : String(result.correctAnswer ?? '');
            return (
              <div className="pg-card" key={result.questionId} style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <strong>Question {index + 1}</strong>
                  <Badge variant={result.correct ? 'success' : 'danger'}>{result.correct ? 'Correct' : 'Incorrect'}</Badge>
                </div>
                {question && <p style={{ fontWeight: 700, margin: '0 0 10px' }}>{payloadText(question.payload)}</p>}
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Your answer:</strong> {answerText}
                </p>
                {!result.correct && (
                  <p style={{ margin: 0 }}>
                    <strong>Correct answer:</strong> {correctAnswer}
                  </p>
                )}
                {result.breakdown.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {result.breakdown.map((item, itemIndex) => (
                      <span key={itemIndex} style={{ fontSize: 13, color: item.correctFlag ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                        {item.label}: You said “{item.student}”, correct answer: “{item.correct}”
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <button type="button" className="pg-btn-secondary" onClick={onRetake}>Back to practice</button>
        </div>
      </div>
    </div>
  );
}

function formatStudentAnswer(result: QuestionResult, studentAnswer: Record<string, unknown> | null, question?: AttemptQuestion): string {
  switch (result.questionType) {
    case 'mcq': {
      const p = (question?.payload as { options?: string[] } | undefined)?.options ?? [];
      const index = typeof studentAnswer?.optionIndex === 'number' ? (studentAnswer.optionIndex as number) : -1;
      return index >= 0 ? String(p[index] ?? '') : 'No answer';
    }
    case 'true_false':
      return studentAnswer && typeof studentAnswer.value === 'boolean' ? (studentAnswer.value ? 'True' : 'False') : 'No answer';
    case 'one_word':
    case 'translation':
      return typeof studentAnswer?.text === 'string' ? String(studentAnswer.text) : 'No answer';
    case 'fill_blank': {
      const blanks = Array.isArray((studentAnswer as { blanks?: string[] } | null)?.blanks) ? ((studentAnswer as { blanks: string[] }).blanks ?? []) : [];
      return blanks.join(', ');
    }
    case 'matching': {
      const pairs = Array.isArray((studentAnswer as { pairs?: Array<{ leftId: string; rightId: string }> } | null)?.pairs) ? ((studentAnswer as { pairs: Array<{ leftId: string; rightId: string }> }).pairs ?? []) : [];
      const question2 = question;
      const left = (question2?.payload as { left?: Array<{ id: string; text: string }> } | undefined)?.left ?? [];
      const right = (question2?.payload as { right?: Array<{ id: string; text: string }> } | undefined)?.right ?? [];
      return pairs
        .map((pair) => `${left.find((item) => item.id === pair.leftId)?.text ?? '?'} → ${right.find((item) => item.id === pair.rightId)?.text ?? '?'}`)
        .join(', ');
    }
    case 'rearrange': {
      const order = Array.isArray((studentAnswer as { order?: string[] } | null)?.order) ? ((studentAnswer as { order: string[] }).order ?? []) : [];
      const items = (question?.payload as { items?: Array<{ id: string; text: string }> } | undefined)?.items ?? [];
      const texts = order.map((id) => items.find((item) => item.id === id)?.text ?? id);
      return texts.join(' ');
    }
    default:
      return 'No answer';
  }
}

export default PracticeAttemptPage;
