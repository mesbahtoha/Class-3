import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import {
  createAdminPracticeQuestion,
  getErrorMessage,
  updateAdminPracticeQuestion,
  type AdminPracticeSetRow,
} from '@/lib/api';

interface PracticeQuestionBuilderProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  set: AdminPracticeSetRow | null;
  existingQuestion: Record<string, unknown> | null;
  mode: 'create' | 'edit';
}

interface BuilderState {
  questionType: string;
  chapterId: string;
  marks: number;
  question: string;
  options: string[];
  correctIndex: number;
  text: string;
  blanks: Array<{ accepted: string; marks: number }>;
  statement: string;
  correct: boolean;
  leftItems: string;
  rightItems: string;
  pairs: Array<{ left: string; right: string }>;
  oneWordQuestion: string;
  oneWordAnswer: string;
  oneWordAlternatives: string;
  rearrangeItems: string;
  source: string;
  sourceLanguage: string;
  targetLanguage: string;
  translationAnswer: string;
  translationAlternatives: string;
}

const QUESTION_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice (MCQ)',
  fill_blank: 'Fill in the Blanks',
  true_false: 'True / False',
  matching: 'Matching',
  one_word: 'One Word Answer',
  rearrange: 'Rearrange',
  translation: 'Translation',
};

function splitLines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function splitCommas(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function emptyState(set: AdminPracticeSetRow | null): BuilderState {
  return {
    questionType: set?.questionType ?? 'mcq',
    chapterId: set?.chapters?.[0]?.id ?? '',
    marks: set?.marksPerQuestion ?? 1,
    question: '',
    options: ['', ''],
    correctIndex: 0,
    text: '',
    blanks: [{ accepted: '', marks: set?.marksPerQuestion ?? 1 }],
    statement: '',
    correct: true,
    leftItems: '',
    rightItems: '',
    pairs: [{ left: '', right: '' }],
    oneWordQuestion: '',
    oneWordAnswer: '',
    oneWordAlternatives: '',
    rearrangeItems: '',
    source: '',
    sourceLanguage: '',
    targetLanguage: '',
    translationAnswer: '',
    translationAlternatives: '',
  };
}

function stateFromQuestion(question: Record<string, unknown>, set: AdminPracticeSetRow | null): BuilderState {
  const next = emptyState(set);
  const type = String(question.questionType ?? set?.questionType ?? 'mcq');
  next.questionType = type;
  next.chapterId = String(question.chapterId || set?.chapters?.[0]?.id || '');
  next.marks = Number(question.marks ?? set?.marksPerQuestion ?? 1);

  if (type === 'mcq') {
    next.question = String(question.question ?? '');
    next.options = Array.isArray(question.options) ? question.options.map(String) : ['', ''];
    if (next.options.length < 2) next.options = [...next.options, '', ''].slice(0, 2);
    next.correctIndex = Number(question.correctIndex ?? 0);
  } else if (type === 'fill_blank') {
    next.text = String(question.text ?? '');
    next.blanks = Array.isArray(question.blanks) && question.blanks.length
      ? (question.blanks as Array<Record<string, unknown>>).map((blank) => ({
          accepted: Array.isArray(blank.accepted) ? blank.accepted.map(String).join(', ') : String(blank.accepted ?? ''),
          marks: Number(blank.marks ?? set?.marksPerQuestion ?? 1),
        }))
      : [{ accepted: '', marks: set?.marksPerQuestion ?? 1 }];
  } else if (type === 'true_false') {
    next.statement = String(question.statement ?? '');
    next.correct = Boolean(question.correct);
  } else if (type === 'matching') {
    next.leftItems = Array.isArray(question.left) ? question.left.map(String).join('\n') : '';
    next.rightItems = Array.isArray(question.right) ? question.right.map(String).join('\n') : '';
    next.pairs = Array.isArray(question.pairs) && question.pairs.length
      ? (question.pairs as Array<Record<string, unknown>>).map((pair) => ({
          left: String(pair.left ?? ''),
          right: String(pair.right ?? ''),
        }))
      : [{ left: '', right: '' }];
  } else if (type === 'one_word') {
    next.oneWordQuestion = String(question.question ?? '');
    next.oneWordAnswer = String(question.answer ?? '');
    next.oneWordAlternatives = Array.isArray(question.alternatives) ? question.alternatives.map(String).join(', ') : '';
  } else if (type === 'rearrange') {
    // The API returns items in the correct order, not the shuffled display order.
    next.rearrangeItems = Array.isArray(question.items) ? question.items.map(String).join('\n') : '';
  } else if (type === 'translation') {
    next.source = String(question.source ?? question.question ?? '');
    next.sourceLanguage = String(question.sourceLanguage ?? '');
    next.targetLanguage = String(question.targetLanguage ?? '');
    next.translationAnswer = String(question.answer ?? '');
    next.translationAlternatives = Array.isArray(question.alternatives) ? question.alternatives.map(String).join(', ') : '';
  }
  return next;
}

function markerCount(text: string): number {
  return new Set(Array.from(text.matchAll(/\{\{(\d+)\}\}/g)).map((match) => match[1])).size;
}

export function PracticeQuestionBuilder({ open, onClose, onSaved, set, existingQuestion, mode }: PracticeQuestionBuilderProps) {
  const [state, setState] = useState<BuilderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState(existingQuestion ? stateFromQuestion(existingQuestion, set) : emptyState(set));
    setError(null);
    setSaving(false);
  }, [open, existingQuestion, mode, set]);

  if (!state) return null;

  const update = (patch: Partial<BuilderState>) => setState((current) => (current ? { ...current, ...patch } : current));

  const validate = (): string | null => {
    if (!set) return 'Select a question set first.';
    if (set.chapters.length > 1 && !state.chapterId) return 'Select a chapter for this question.';
    if (state.marks < 1) return 'Marks must be at least 1.';

    if (state.questionType === 'mcq') {
      if (!state.question.trim()) return 'Enter the question text.';
      if (state.options.length < 2) return 'Add at least two options.';
      if (state.options.some((option) => !option.trim())) return 'Every option needs text.';
      if (state.correctIndex < 0 || state.correctIndex >= state.options.length) return 'Select the correct option.';
    } else if (state.questionType === 'fill_blank') {
      if (!state.text.trim()) return 'Enter the sentence with blank markers.';
      const markers = markerCount(state.text);
      if (markers === 0) return 'Use {{1}}, {{2}} … in the sentence to mark the blanks.';
      if (markers !== state.blanks.length) return `The sentence has ${markers} blank(s), but ${state.blanks.length} answer(s) are listed.`;
      if (state.blanks.some((blank) => !blank.accepted.trim())) return 'Every blank needs at least one accepted answer.';
    } else if (state.questionType === 'true_false') {
      if (!state.statement.trim()) return 'Enter the statement.';
    } else if (state.questionType === 'matching') {
      const left = splitLines(state.leftItems);
      const right = splitLines(state.rightItems);
      if (left.length < 2 || right.length < 2) return 'Add at least two items in each column.';
      if (state.pairs.length === 0) return 'Add at least one matching pair.';
      if (state.pairs.some((pair) => !left.includes(pair.left) || !right.includes(pair.right))) {
        return 'Every pair must use one item from each column.';
      }
    } else if (state.questionType === 'one_word') {
      if (!state.oneWordQuestion.trim()) return 'Enter the question.';
      if (!state.oneWordAnswer.trim()) return 'Enter the accepted answer.';
    } else if (state.questionType === 'rearrange') {
      if (splitLines(state.rearrangeItems).length < 2) return 'Add at least two items in the correct order.';
    } else if (state.questionType === 'translation') {
      if (!state.source.trim()) return 'Enter the source sentence.';
      if (!state.targetLanguage.trim()) return 'Enter the target language.';
      if (!state.translationAnswer.trim()) return 'Enter the accepted translation.';
    }
    return null;
  };

  const save = async () => {
    if (!set) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);

    const marks = state.marks;
    const question: Record<string, unknown> =
      state.questionType === 'mcq'
        ? { questionType: 'mcq', question: state.question.trim(), options: state.options.map((option) => option.trim()), correctIndex: state.correctIndex, marks }
        : state.questionType === 'fill_blank'
          ? {
              questionType: 'fill_blank',
              text: state.text.trim(),
              blanks: state.blanks.map((blank) => ({ accepted: splitCommas(blank.accepted), marks: blank.marks || marks })),
              marks,
            }
          : state.questionType === 'true_false'
            ? { questionType: 'true_false', statement: state.statement.trim(), correct: state.correct, marks }
            : state.questionType === 'matching'
              ? {
                  questionType: 'matching',
                  left: splitLines(state.leftItems),
                  right: splitLines(state.rightItems),
                  pairs: state.pairs,
                  marks,
                }
              : state.questionType === 'one_word'
                ? {
                    questionType: 'one_word',
                    question: state.oneWordQuestion.trim(),
                    answer: state.oneWordAnswer.trim(),
                    alternatives: splitCommas(state.oneWordAlternatives),
                    marks,
                  }
                : state.questionType === 'rearrange'
                  ? { questionType: 'rearrange', items: splitLines(state.rearrangeItems), marks }
                  : {
                      questionType: 'translation',
                      source: state.source.trim(),
                      sourceLanguage: state.sourceLanguage.trim() || undefined,
                      targetLanguage: state.targetLanguage.trim(),
                      answer: state.translationAnswer.trim(),
                      alternatives: splitCommas(state.translationAlternatives),
                      marks,
                    };

    try {
      const payload = { ...question, chapterId: state.chapterId || undefined };
      if (mode === 'create') {
        await createAdminPracticeQuestion(set._id, payload);
        toast.success('Question added.');
      } else {
        await updateAdminPracticeQuestion(set._id, String(existingQuestion?._id ?? ''), payload);
        toast.success('Question updated.');
      }
      onSaved();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const addOption = () => {
    if (state.options.length >= 6) return;
    update({ options: [...state.options, ''] });
  };

  const removeOption = (index: number) => {
    if (state.options.length <= 2) return;
    const next = state.options.filter((_, i) => i !== index);
    update({ options: next, correctIndex: Math.min(state.correctIndex, next.length - 1) });
  };

  const autoPair = () => {
    const left = splitLines(state.leftItems);
    const right = splitLines(state.rightItems);
    const size = Math.min(left.length, right.length);
    update({ pairs: Array.from({ length: size }, (_, index) => ({ left: left[index], right: right[index] })) });
  };

  const submitLabel = mode === 'create' ? 'Add question' : 'Save question';

  return (
    <Modal open={open} onClose={onClose} title={mode === 'create' ? 'Add question' : 'Edit question'} maxWidth={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div role="alert" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-danger, #fee2e2)', color: 'var(--text-danger, #991b1b)', whiteSpace: 'normal' }}>
            {error}
          </div>
        )}

        {set && set.chapters.length > 1 && (
          <Field label="Chapter">
            <Select value={state.chapterId} onChange={(e) => update({ chapterId: e.target.value })}>
              {set.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.order > 0 ? `${chapter.order}. ` : ''}{chapter.title}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Question type">
          <Input value={QUESTION_LABELS[state.questionType] ?? state.questionType} readOnly disabled />
        </Field>

        {state.questionType === 'mcq' && (
          <>
            <Field label="Question text">
              <Textarea rows={2} value={state.question} onChange={(e) => update({ question: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.options.map((option, index) => {
                const selected = state.correctIndex === index;
                return (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: 12,
                      border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--border-color)'}`,
                      background: selected ? 'var(--color-primary-soft)' : 'var(--bg-surface)',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}
                      title="Mark this option as the correct answer"
                    >
                      <input
                        type="radio"
                        name="correct-option"
                        checked={selected}
                        onChange={() => update({ correctIndex: index })}
                        aria-label={`Option ${index + 1} is correct`}
                        style={{ width: 18, height: 18, margin: 0 }}
                      />
                      <span className="text-muted small" style={{ whiteSpace: 'nowrap' }}>Correct</span>
                    </label>
                    <Input
                      value={option}
                      placeholder={`Option ${index + 1}`}
                      aria-label={`Option ${index + 1}`}
                      style={{ flex: 1, minWidth: 0 }}
                      onChange={(e) => {
                        const next = [...state.options];
                        next[index] = e.target.value;
                        update({ options: next });
                      }}
                    />
                    {selected && <Badge variant="primary">Selected</Badge>}
                    <Button variant="secondary" onClick={() => removeOption(index)} disabled={state.options.length <= 2}>Remove</Button>
                  </div>
                );
              })}
              <div>
                <Button variant="secondary" onClick={addOption} disabled={state.options.length >= 6}>Add option</Button>
                <span className="text-muted small" style={{ marginLeft: 8 }}>Select the radio button next to the correct answer.</span>
              </div>
            </div>
          </>
        )}

        {state.questionType === 'fill_blank' && (
          <>
            <Field label="Sentence (use {{1}}, {{2}} … for blanks)">
              <Textarea rows={2} value={state.text} onChange={(e) => update({ text: e.target.value })} />
            </Field>
            {state.blanks.map((blank, index) => (
              <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>Blank {index + 1}</span>
                <Input value={blank.accepted} placeholder="Accepted answers (comma separated)" onChange={(e) => {
                  const next = [...state.blanks];
                  next[index] = { ...blank, accepted: e.target.value };
                  update({ blanks: next });
                }} />
                <Input type="number" min={1} max={100} value={blank.marks} style={{ width: 90 }} onChange={(e) => {
                  const next = [...state.blanks];
                  next[index] = { ...blank, marks: Number(e.target.value) || 1 };
                  update({ blanks: next });
                }} />
                <Button variant="secondary" onClick={() => update({ blanks: state.blanks.filter((_, i) => i !== index) })} disabled={state.blanks.length <= 1}>Remove</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ blanks: [...state.blanks, { accepted: '', marks: state.marks }] })} disabled={state.blanks.length >= 6}>Add blank</Button>
          </>
        )}

        {state.questionType === 'true_false' && (
          <>
            <Field label="Statement">
              <Textarea rows={2} value={state.statement} onChange={(e) => update({ statement: e.target.value })} />
            </Field>
            <Field label="Correct answer">
              <Select value={String(state.correct)} onChange={(e) => update({ correct: e.target.value === 'true' })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </Select>
            </Field>
          </>
        )}

        {state.questionType === 'matching' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Column A items (one per line)">
                <Textarea rows={4} value={state.leftItems} onChange={(e) => update({ leftItems: e.target.value })} />
              </Field>
              <Field label="Column B items (one per line)">
                <Textarea rows={4} value={state.rightItems} onChange={(e) => update({ rightItems: e.target.value })} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={autoPair}>Auto-pair by order</Button>
              <Button variant="secondary" onClick={() => update({ pairs: [...state.pairs, { left: '', right: '' }] })} disabled={state.pairs.length >= 8}>Add pair</Button>
            </div>
            {state.pairs.map((pair, index) => (
              <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select value={pair.left} onChange={(e) => {
                  const next = state.pairs.map((item, i) => (i === index ? { ...item, left: e.target.value } : item));
                  update({ pairs: next });
                }}>
                  <option value="">Column A item</option>
                  {splitLines(state.leftItems).map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Select value={pair.right} onChange={(e) => {
                  const next = state.pairs.map((item, i) => (i === index ? { ...item, right: e.target.value } : item));
                  update({ pairs: next });
                }}>
                  <option value="">Column B item</option>
                  {splitLines(state.rightItems).map((value) => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Button variant="secondary" onClick={() => update({ pairs: state.pairs.filter((_, i) => i !== index) })} disabled={state.pairs.length <= 1}>Remove</Button>
              </div>
            ))}
          </>
        )}

        {state.questionType === 'one_word' && (
          <>
            <Field label="Question">
              <Textarea rows={2} value={state.oneWordQuestion} onChange={(e) => update({ oneWordQuestion: e.target.value })} />
            </Field>
            <Field label="Correct answer">
              <Input value={state.oneWordAnswer} onChange={(e) => update({ oneWordAnswer: e.target.value })} />
            </Field>
            <Field label="Alternative answers (comma separated)">
              <Input value={state.oneWordAlternatives} onChange={(e) => update({ oneWordAlternatives: e.target.value })} />
            </Field>
          </>
        )}

        {state.questionType === 'rearrange' && (
          <>
            <Field label="Correct order (one item per line)">
              <Textarea rows={4} value={state.rearrangeItems} onChange={(e) => update({ rearrangeItems: e.target.value })} />
            </Field>
            <p className="text-muted small">Students will see these items shuffled automatically.</p>
          </>
        )}

        {state.questionType === 'translation' && (
          <>
            <Field label="Source sentence">
              <Textarea rows={2} value={state.source} onChange={(e) => update({ source: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Source language (optional)">
                <Input value={state.sourceLanguage} onChange={(e) => update({ sourceLanguage: e.target.value })} />
              </Field>
              <Field label="Target language">
                <Input value={state.targetLanguage} onChange={(e) => update({ targetLanguage: e.target.value })} />
              </Field>
            </div>
            <Field label="Correct translation">
              <Textarea rows={2} value={state.translationAnswer} onChange={(e) => update({ translationAnswer: e.target.value })} />
            </Field>
            <Field label="Alternative translations (comma separated)">
              <Input value={state.translationAlternatives} onChange={(e) => update({ translationAlternatives: e.target.value })} />
            </Field>
          </>
        )}

        <Field label="Marks">
          <Input type="number" min={1} max={100} value={state.marks} onChange={(e) => update({ marks: Number(e.target.value) || 1 })} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default PracticeQuestionBuilder;
