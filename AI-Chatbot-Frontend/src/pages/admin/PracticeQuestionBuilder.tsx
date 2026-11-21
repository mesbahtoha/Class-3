import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { createAdminPracticeQuestion, updateAdminPracticeQuestion, type AdminPracticeSetRow } from '@/lib/api';

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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const QUESTION_TYPE_OPTIONS = [
  { value: 'mcq', label: 'Multiple Choice (MCQ)' },
  { value: 'fill_blank', label: 'Fill in the Blanks' },
  { value: 'true_false', label: 'True / False' },
  { value: 'matching', label: 'Matching' },
  { value: 'one_word', label: 'One Word Answer' },
  { value: 'rearrange', label: 'Rearrange' },
  { value: 'translation', label: 'Translation' },
];

export function PracticeQuestionBuilder({ open, onClose, onSaved, set, existingQuestion, mode }: PracticeQuestionBuilderProps) {
  const [state, setState] = useState<BuilderState | null>(null);

  useEffect(() => {
    if (!open) return;
    const next: BuilderState = {
      questionType: set?.questionType ?? 'mcq',
      chapterId: set?.chapters?.[0]?.id ?? '',
      marks: set?.marksPerQuestion ?? 1,
      question: '',
      options: ['Option 1', 'Option 2'],
      correctIndex: 0,
      text: '',
      blanks: [{ accepted: '', marks: 1 }],
      statement: '',
      correct: true,
      leftItems: '',
      rightItems: '',
      pairs: [],
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

    if (existingQuestion) {
      const payload = (existingQuestion.payload ?? {}) as Record<string, unknown>;
      const answer = (existingQuestion.answer ?? {}) as Record<string, unknown>;
      next.questionType = String(existingQuestion.questionType ?? 'mcq');
      next.chapterId = String(existingQuestion.chapterId || set?.chapters?.[0]?.id || '');
      next.marks = Number(existingQuestion.marks ?? set?.marksPerQuestion ?? 1);
      next.question = String(payload.question ?? '');
      next.options = Array.isArray(payload.options) ? payload.options.map((o) => String(o)) : ['Option 1', 'Option 2'];
      next.correctIndex = Number(answer.correctIndex ?? 0);
      next.text = String(payload.text ?? '');
      next.blanks = Array.isArray(answer.blanks) ? answer.blanks.map((b) => ({
        accepted: Array.isArray((b as Record<string, unknown>).accepted) ? (b as string[]).join(', ') : String((b as Record<string, unknown>).accepted ?? ''),
        marks: Number((b as Record<string, unknown>).marks ?? 1),
      })) : [{ accepted: '', marks: 1 }];
      next.statement = String(payload.statement ?? '');
      next.correct = Boolean(answer.value);
      next.leftItems = Array.isArray(payload.left) ? (payload.left as Array<{ text?: unknown }>).map((i) => String(i.text ?? '')).join('\n') : '';
      next.rightItems = Array.isArray(payload.right) ? (payload.right as Array<{ text?: unknown }>).map((i) => String(i.text ?? '')).join('\n') : '';
      next.pairs = Array.isArray(answer.pairs) ? answer.pairs.map((p) => ({
        left: String((p as Record<string, unknown>).leftId ?? ''),
        right: String((p as Record<string, unknown>).rightId ?? ''),
      })) : [];
      next.oneWordQuestion = String(payload.question ?? '');
      next.oneWordAnswer = Array.isArray(answer.accepted) ? String(answer.accepted[0] ?? '') : String(answer.accepted ?? '');
      next.oneWordAlternatives = Array.isArray(answer.accepted) ? String((answer.accepted as string[]).slice(1).join(', ')) : '';
      next.rearrangeItems = Array.isArray(payload.items) ? (payload.items as Array<{ text?: unknown }>).map((i) => String(i.text ?? '')).join('\n') : '';
      next.source = String(payload.source ?? '');
      next.sourceLanguage = String(payload.sourceLanguage ?? '');
      next.targetLanguage = String(payload.targetLanguage ?? '');
      next.translationAnswer = Array.isArray(answer.accepted) ? String(answer.accepted[0] ?? '') : String(answer.accepted ?? '');
      next.translationAlternatives = Array.isArray(answer.accepted) ? String((answer.accepted as string[]).slice(1).join(', ')) : '';
    }

    setState(next);
  }, [open, existingQuestion, mode, set]);

  if (!state) return null;

  const update = (patch: Partial<BuilderState>) => setState({ ...state, ...patch });

  const save = async () => {
    if (!state) return;
    const marks = state.marks;
    const question: Record<string, unknown> =
      state.questionType === 'mcq'
        ? { questionType: 'mcq', question: state.question, options: state.options, correctIndex: state.correctIndex, marks }
        : state.questionType === 'fill_blank'
          ? { questionType: 'fill_blank', text: state.text, blanks: state.blanks.map((b) => ({ accepted: b.accepted.split(',').map((a) => a.trim()).filter(Boolean), marks: b.marks })), marks }
          : state.questionType === 'true_false'
            ? { questionType: 'true_false', statement: state.statement, correct: state.correct, marks }
            : state.questionType === 'matching'
              ? {
                  questionType: 'matching',
                  left: state.leftItems.split('\n').map((s) => s.trim()).filter(Boolean),
                  right: state.rightItems.split('\n').map((s) => s.trim()).filter(Boolean),
                  pairs: state.pairs,
                  marks,
                }
              : state.questionType === 'one_word'
                ? { questionType: 'one_word', question: state.oneWordQuestion, answer: state.oneWordAnswer, alternatives: state.oneWordAlternatives.split(',').map((s) => s.trim()).filter(Boolean), marks }
                : state.questionType === 'rearrange'
                  ? { questionType: 'rearrange', items: state.rearrangeItems.split('\n').map((s) => s.trim()).filter(Boolean), marks }
                  : {
                      questionType: 'translation',
                      source: state.source,
                      sourceLanguage: state.sourceLanguage || undefined,
                      targetLanguage: state.targetLanguage,
                      answer: state.translationAnswer,
                      alternatives: state.translationAlternatives.split(',').map((s) => s.trim()).filter(Boolean),
                      marks,
                    };

    const payload: Record<string, unknown> = {
      ...question,
      chapterId: state.chapterId,
    };

    if (mode === 'create') {
      await createAdminPracticeQuestion(String(set?._id ?? ''), payload);
    } else {
      await updateAdminPracticeQuestion(String(set?._id ?? ''), String(existingQuestion?._id ?? ''), payload);
    }
    onSaved();
    onClose();
  };

  const submitLabel = mode === 'create' ? 'Add question' : 'Save question';

  return (
    <Modal open={open} onClose={onClose} title={mode === 'create' ? 'Add question' : 'Edit question'} maxWidth={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(set?.chapters?.length ?? 0) > 1 && (
          <Field label="Chapter">
            <Select value={state.chapterId} onChange={(e) => update({ chapterId: e.target.value })}>
              {set?.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Question type">
          <Select value={state.questionType} onChange={(e) => update({ questionType: e.target.value })}>
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>

        {state.questionType === 'mcq' && (
          <>
            <Field label="Question text">
              <Textarea rows={2} value={state.question} onChange={(e) => update({ question: e.target.value })} />
            </Field>
            {state.options.map((option, index) => (
              <div key={index} style={{ display: 'flex', gap: 8 }}>
                <Input value={option} onChange={(e) => {
                  const next = [...state.options];
                  next[index] = e.target.value;
                  update({ options: next });
                }} />
                <Button variant="secondary" onClick={() => update({ options: state.options.filter((_, i) => i !== index) })}>Remove</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ options: [...state.options, `Option ${state.options.length + 1}`] })}>Add option</Button>
            <Field label={`Correct answer (index of "${state.options[state.correctIndex] ?? ''}")`}>
              <Input type="number" min={0} max={Math.max(0, state.options.length - 1)} value={state.correctIndex} onChange={(e) => update({ correctIndex: Number(e.target.value) })} />
            </Field>
          </>
        )}

        {state.questionType === 'fill_blank' && (
          <>
            <Field label="Sentence (use {{1}}, {{2}} … for blanks)">
              <Textarea rows={2} value={state.text} onChange={(e) => update({ text: e.target.value })} />
            </Field>
            {state.blanks.map((blank, index) => (
              <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>Blank {index + 1}</span>
                <Input value={blank.accepted} placeholder="Accepted answers (comma separated)" onChange={(e) => {
                  const next = [...state.blanks];
                  next[index] = { ...blank, accepted: e.target.value };
                  update({ blanks: next });
                }} />
                <Input type="number" min={0} max={100} value={blank.marks} onChange={(e) => {
                  const next = [...state.blanks];
                  next[index] = { ...blank, marks: Number(e.target.value) || 0 };
                  update({ blanks: next });
                }} />
                <Button variant="secondary" onClick={() => update({ blanks: state.blanks.filter((_, i) => i !== index) })}>Remove</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ blanks: [...state.blanks, { accepted: '', marks: state.marks }] })}>Add blank</Button>
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
            <Field label="Column A items (one per line)">
              <Textarea rows={3} value={state.leftItems} onChange={(e) => update({ leftItems: e.target.value })} />
            </Field>
            <Field label="Column B items (one per line)">
              <Textarea rows={3} value={state.rightItems} onChange={(e) => update({ rightItems: e.target.value })} />
            </Field>
            {state.pairs.map((pair, index) => (
              <div key={index} style={{ display: 'flex', gap: 8 }}>
                <Select value={pair.left} onChange={(e) => {
                  const next = state.pairs.map((p, i) => (i === index ? { ...p, left: e.target.value } : p));
                  update({ pairs: next });
                }}>
                  <option value="">—</option>
                  {state.leftItems.split('\n').map((s) => s.trim()).filter(Boolean).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Select value={pair.right} onChange={(e) => {
                  const next = state.pairs.map((p, i) => (i === index ? { ...p, right: e.target.value } : p));
                  update({ pairs: next });
                }}>
                  <option value="">—</option>
                  {state.rightItems.split('\n').map((s) => s.trim()).filter(Boolean).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </Select>
                <Button variant="secondary" onClick={() => update({ pairs: state.pairs.filter((_, i) => i !== index) })}>Remove</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ pairs: [...state.pairs, { left: '', right: '' }] })}>Add pair</Button>
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
            <Field label="Correct sequence (one item per line)">
              <Textarea rows={3} value={state.rearrangeItems} onChange={(e) => update({ rearrangeItems: e.target.value })} />
            </Field>
            <Button variant="secondary" onClick={() => update({ rearrangeItems: shuffle(state.rearrangeItems.split('\n').map((s) => s.trim()).filter(Boolean)).join('\n') })}>Shuffle preview</Button>
          </>
        )}

        {state.questionType === 'translation' && (
          <>
            <Field label="Source sentence">
              <Textarea rows={2} value={state.source} onChange={(e) => update({ source: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Source language">
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
          <Input type="number" min={0} max={100} value={state.marks} onChange={(e) => update({ marks: Number(e.target.value) || 0 })} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={mode === 'create' && state.questionType === 'fill_blank' && !state.text.trim()}>{submitLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default PracticeQuestionBuilder;
