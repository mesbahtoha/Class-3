import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { createAdminPracticeSet, getErrorMessage, listPracticeChapters, updateAdminPracticeSet, type AdminPracticeSetRow } from '@/lib/api';
import { adminListBooks } from '@/lib/tutor';
import type { AdminBook } from '@/types';

interface SetEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: (created?: AdminPracticeSetRow) => void;
  initial: AdminPracticeSetRow | null;
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
};

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice (MCQ)' },
  { value: 'fill_blank', label: 'Fill in the Blanks' },
  { value: 'true_false', label: 'True / False' },
  { value: 'matching', label: 'Matching' },
  { value: 'one_word', label: 'One Word Answer' },
  { value: 'rearrange', label: 'Rearrange' },
  { value: 'translation', label: 'Translation' },
];

export function PracticeSetEditor({ open, onClose, onSaved, initial }: SetEditorProps) {
  const [form, setForm] = useState<SetFormState>(EMPTY_FORM);
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [chapters, setChapters] = useState<Array<{ id: string; title: string; order: number }>>([]);
  const [allChaptersSelected, setAllChaptersSelected] = useState(true);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialChapterIds = useRef<string[]>([]);
  const appliedInitialBook = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
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
          }
        : EMPTY_FORM
    );
    initialChapterIds.current = initial?.chapters?.map((chapter) => chapter.id) ?? [];
    appliedInitialBook.current = null;
    setSelectedChapterIds([]);
    setAllChaptersSelected(true);
    setChapters([]);
  }, [open, initial]);

  // Books must load as soon as the modal opens, before any book is selected.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingBooks(true);
    void adminListBooks()
      .then((list) => {
        if (cancelled) return;
        setBooks(list.filter((book) => book.publicationState !== 'archived'));
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingBooks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !form.bookId) {
      setChapters([]);
      setLoadingChapters(false);
      return;
    }
    let cancelled = false;
    setLoadingChapters(true);
    setError(null);
    void listPracticeChapters(form.bookId)
      .then((payload) => {
        if (cancelled) return;
        setChapters(payload.chapters);
        const available = new Set(payload.chapters.map((chapter) => chapter.id));
        const isInitialBook = Boolean(initial && form.bookId === initial.bookId);
        if (isInitialBook && appliedInitialBook.current !== form.bookId) {
          // Apply the saved subset exactly once per open. The ref survives
          // React StrictMode's double effect run, so it cannot reset to "All".
          const chosen = initialChapterIds.current.filter((id) => available.has(id));
          const all = chosen.length === payload.chapters.length;
          setAllChaptersSelected(all || chosen.length === 0);
          setSelectedChapterIds(all ? [] : chosen);
          appliedInitialBook.current = form.bookId;
        } else if (!isInitialBook) {
          setAllChaptersSelected(true);
          setSelectedChapterIds([]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setChapters([]);
          setError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingChapters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.bookId, initial]);

  const selectedChapterCount = allChaptersSelected ? chapters.length : selectedChapterIds.length;

  const toggleAllChapters = () => {
    setAllChaptersSelected((current) => {
      const next = !current;
      setSelectedChapterIds(next ? chapters.map((chapter) => chapter.id) : []);
      return next;
    });
  };

  const toggleChapter = (id: string) => {
    if (allChaptersSelected) {
      setAllChaptersSelected(false);
      setSelectedChapterIds(chapters.filter((chapter) => chapter.id !== id).map((chapter) => chapter.id));
      return;
    }
    setSelectedChapterIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const changeBook = (bookId: string) => {
    appliedInitialBook.current = bookId;
    setAllChaptersSelected(true);
    setSelectedChapterIds([]);
    setChapters([]);
    setForm((current) => ({ ...current, bookId }));
  };

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Enter a title for this question set.';
    if (!form.bookId) return 'Select a book.';
    if (!chapters.length) return 'This book has no chapters yet. Import or re-index the book first.';
    if (selectedChapterCount === 0) return 'Select at least one chapter.';
    if (form.marksPerQuestion < 1) return 'Marks per question must be at least 1.';
    if (!form.practiceModeEnabled && !form.examModeEnabled) return 'Enable practice mode, exam mode, or both.';
    if (form.examModeEnabled) {
      const duration = Number(form.examDurationMinutes);
      if (!Number.isFinite(duration) || duration < 1) return 'Exam mode needs a duration in minutes.';
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      bookId: form.bookId,
      chapters: allChaptersSelected ? chapters.map((chapter) => chapter.id) : selectedChapterIds,
      questionType: form.questionType,
      difficulty: form.difficulty,
      instructions: form.instructions,
      marksPerQuestion: form.marksPerQuestion,
      practiceModeEnabled: form.practiceModeEnabled,
      examModeEnabled: form.examModeEnabled,
      examDurationMinutes: form.examModeEnabled && form.examDurationMinutes ? Number(form.examDurationMinutes) : null,
      negativeMarking: form.negativeMarking,
      allowUnanswered: form.allowUnanswered,
    };
    try {
      const result = initial
        ? await updateAdminPracticeSet(initial._id, payload)
        : await createAdminPracticeSet({ ...payload, publicationState: 'draft' });
      toast.success(initial ? 'Question set updated.' : 'Draft question set created. Add questions, then publish.');
      // Only a new set should jump straight into the question manager.
      onSaved(initial ? undefined : result?.set);
      onClose();
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const typeLocked = Boolean(initial && (initial.totalQuestions ?? 0) > 0);
  const busy = loadingBooks || loadingChapters || saving;

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit question set' : 'New question set'} maxWidth={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div className="pg-badge pg-badge-coral" role="alert" style={{ padding: '10px 12px', whiteSpace: 'normal' }}>
            {error}
          </div>
        )}
        <Field label="Title">
          <Input aria-label="Set title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Fraction practice, Chapter 1–3" />
        </Field>
        <Field label="Book">
          <Select aria-label="Set book" value={form.bookId} onChange={(e) => changeBook(e.target.value)} disabled={loadingBooks}>
            <option value="">{loadingBooks ? 'Loading books…' : 'Select a book'}</option>
            {books.map((book) => (
              <option key={book._id} value={book._id}>
                {book.title} ({book.subject}){book.publicationState !== 'published' ? ' — draft book' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {!loadingBooks && books.length === 0 && (
          <p className="text-muted">{error ? 'Could not load books.' : 'No books found. Import a book first.'}</p>
        )}
        <Field label="Chapters">
          {loadingChapters ? (
            <p className="text-muted">Loading chapters…</p>
          ) : !form.bookId ? (
            <p className="text-muted">Select a book to choose chapters.</p>
          ) : chapters.length === 0 ? (
            <p className="text-muted">No chapters found for this book. Re-index the book from Admin → Books, then try again.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allChaptersSelected} onChange={toggleAllChapters} /> All chapters ({chapters.length})
              </label>
              {!allChaptersSelected && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                  {chapters.map((chapter) => (
                    <label key={chapter.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedChapterIds.includes(chapter.id)} onChange={() => toggleChapter(chapter.id)} />
                      {chapter.order > 0 ? `${chapter.order}. ` : ''}{chapter.title}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-muted small">{selectedChapterCount} chapter(s) selected</p>
            </div>
          )}
        </Field>
        <Field label="Question type">
          <Select aria-label="Set question type" value={form.questionType} onChange={(e) => setForm({ ...form, questionType: e.target.value })} disabled={typeLocked}>
            {QUESTION_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </Select>
          {typeLocked && <p className="text-muted small">The type is locked because this set already has questions.</p>}
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
            <Input type="number" min={1} max={100} value={form.marksPerQuestion} onChange={(e) => setForm({ ...form, marksPerQuestion: Number(e.target.value) || 1 })} />
          </Field>
        </div>
        <Field label="Instructions (optional)">
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
        </div>
        {form.examModeEnabled && (
          <Field label="Exam duration (minutes)">
            <Input type="number" min={1} max={600} value={form.examDurationMinutes} onChange={(e) => setForm({ ...form, examDurationMinutes: e.target.value })} />
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Negative marking (%)">
            <Input type="number" min={0} max={50} value={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <p className="text-muted small">New sets start as drafts. Use Publish in the list once the questions are ready.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{saving ? 'Saving…' : 'Save set'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default PracticeSetEditor;
