import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { listPracticeChapters, createAdminPracticeSet, updateAdminPracticeSet } from '@/lib/api';
import { adminListBooks } from '@/lib/tutor';
import type { AdminBook, PracticeQuestionSetSummary } from '@/types';

interface SetEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: PracticeQuestionSetSummary | null;
}

interface SetFormState {
  title: string;
  bookId: string;
  questionType: string;
  difficulty: string;
  instructions: string;
  marksPerQuestion: number;
  practiceModeEnabled: boolean;
  examModeEnabled: boolean;
  examDurationMinutes: string;
  negativeMarking: number;
  allowUnanswered: boolean;
  publicationState: string;
}

const EMPTY_FORM: SetFormState = {
  title: '',
  bookId: '',
  questionType: 'mcq',
  difficulty: 'easy',
  instructions: '',
  marksPerQuestion: 1,
  practiceModeEnabled: true,
  examModeEnabled: false,
  examDurationMinutes: '',
  negativeMarking: 0,
  allowUnanswered: false,
  publicationState: 'draft',
};

export function PracticeSetEditor({ open, onClose, onSaved, initial }: SetEditorProps) {
  const [form, setForm] = useState<SetFormState>(EMPTY_FORM);
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [chapters, setChapters] = useState<Array<{ id: string; title: string; order: number }>>([]);
  const [allChaptersSelected, setAllChaptersSelected] = useState(true);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            title: initial.title,
            bookId: initial.bookId,
            questionType: initial.questionType,
            difficulty: initial.difficulty,
            instructions: initial.instructions,
            marksPerQuestion: initial.marksPerQuestion,
            practiceModeEnabled: initial.practiceModeEnabled,
            examModeEnabled: initial.examModeEnabled,
            examDurationMinutes: initial.examDurationMinutes ? String(initial.examDurationMinutes) : '',
            negativeMarking: initial.negativeMarking,
            allowUnanswered: initial.allowUnanswered,
            publicationState: initial.draft ? 'draft' : 'published',
          }
        : EMPTY_FORM
    );
    setAllChaptersSelected(true);
    setSelectedChapterIds([]);
    setChapters([]);
  }, [open, initial]);

  useEffect(() => {
    if (!open || !form.bookId) return;
    let cancelled = false;
    setLoadingBooks(true);
    void (async () => {
      const list = await adminListBooks({ publicationState: 'published' });
      if (cancelled) return;
      setBooks(list);
      const chaptersPayload = await listPracticeChapters(form.bookId);
      if (cancelled) return;
      setChapters(chaptersPayload.chapters);
      setAllChaptersSelected(true);
      setSelectedChapterIds([]);
    })();
    return () => {
      cancelled = true;
      setLoadingBooks(false);
    };
  }, [open, form.bookId]);

  const toggleAllChapters = () => {
    setAllChaptersSelected((current) => {
      const next = !current;
      setSelectedChapterIds(next ? chapters.map((c) => c.id) : []);
      return next;
    });
  };

  const toggleChapter = (id: string) => {
    if (allChaptersSelected) {
      setAllChaptersSelected(false);
      setSelectedChapterIds(chapters.filter((c) => c.id !== id).map((c) => c.id));
      return;
    }
    setSelectedChapterIds((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  };

  const save = async () => {
    const payload: Record<string, unknown> = {
      title: form.title,
      bookId: form.bookId,
      chapters: form.bookId ? (allChaptersSelected ? chapters.map((c) => c.id) : selectedChapterIds) : [],
      questionType: form.questionType,
      difficulty: form.difficulty,
      instructions: form.instructions,
      marksPerQuestion: form.marksPerQuestion,
      practiceModeEnabled: form.practiceModeEnabled,
      examModeEnabled: form.examModeEnabled,
      examDurationMinutes: form.examDurationMinutes ? Number(form.examDurationMinutes) : null,
      negativeMarking: form.negativeMarking,
      allowUnanswered: form.allowUnanswered,
      publicationState: form.publicationState,
    };
    if (initial) {
      await updateAdminPracticeSet(initial._id, payload);
    } else {
      await createAdminPracticeSet(payload);
    }
    onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit question set' : 'New question set'} maxWidth={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Bangladesh Animals, Unit 2" />
        </Field>
        <Field label="Book">
          <Select
            value={form.bookId}
            onChange={(e) => setForm({ ...form, bookId: e.target.value })}
          >
            <option value="">Select a book</option>
            {books.map((b) => (
              <option key={b._id} value={b._id}>{b.title} ({b.subject})</option>
            ))}
          </Select>
        </Field>
        <Field label="Chapters">
          {loadingBooks ? <p className="text-muted">Loading chapters…</p> : chapters.length === 0 ? <p className="text-muted">No chapters found for this book.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allChaptersSelected} onChange={toggleAllChapters} /> All chapters
              </label>
              {!allChaptersSelected && chapters.map((c) => (
                <label key={c.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={selectedChapterIds.includes(c.id)} onChange={() => toggleChapter(c.id)} /> Chapter {c.order + 1}: {c.title}
                </label>
              ))}
            </div>
          )}
        </Field>
        <Field label="Question type">
          <Select value={form.questionType} onChange={(e) => setForm({ ...form, questionType: e.target.value })}>
            <option value="mcq">Multiple Choice (MCQ)</option>
            <option value="fill_blank">Fill in the Blanks</option>
            <option value="true_false">True / False</option>
            <option value="matching">Matching</option>
            <option value="one_word">One Word Answer</option>
            <option value="rearrange">Rearrange</option>
            <option value="translation">Translation</option>
          </Select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Difficulty">
            <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
          </Field>
          <Field label="Marks per question">
            <Input type="number" min={0} max={100} value={form.marksPerQuestion} onChange={(e) => setForm({ ...form, marksPerQuestion: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <Field label="Instructions">
          <Textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.practiceModeEnabled} onChange={(e) => setForm({ ...form, practiceModeEnabled: e.target.checked })} /> Practice mode
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.examModeEnabled} onChange={(e) => setForm({ ...form, examModeEnabled: e.target.checked })} /> Exam mode
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.allowUnanswered} onChange={(e) => setForm({ ...form, allowUnanswered: e.target.checked })} /> Allow unanswered
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.publicationState === 'published'} onChange={(e) => setForm({ ...form, publicationState: e.target.checked ? 'published' : 'draft' })} /> Published
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Exam duration (minutes)">
            <Input type="number" min={1} max={600} value={form.examDurationMinutes} onChange={(e) => setForm({ ...form, examDurationMinutes: e.target.value })} />
          </Field>
          <Field label="Negative marking (%)">
            <Input type="number" min={0} max={50} value={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!form.title || !form.bookId}>Save set</Button>
        </div>
      </div>
    </Modal>
  );
}
