import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonBox } from '@/components/ui/Skeleton';
import { getErrorMessage, listPracticeBooks, listPracticeChapters, listPracticeSets, startPracticeAttempt } from '@/lib/api';
import type { PracticeBookSummary, PracticeChapterSummary, PracticeQuestionSetSummary, PracticeQuestionType, PracticeMode } from '@/types';

const QUESTION_TYPES: Array<{ value: PracticeQuestionType; label: string; description: string }> = [
  { value: 'mcq', label: 'Multiple Choice', description: 'Pick the correct answer from the options.' },
  { value: 'fill_blank', label: 'Fill in the Blanks', description: 'Fill in the missing words in the sentence.' },
  { value: 'true_false', label: 'True / False', description: 'Say whether the statement is true or false.' },
  { value: 'matching', label: 'Matching', description: 'Match the left items with the right items.' },
  { value: 'one_word', label: 'One Word Answer', description: 'Answer using a single word.' },
  { value: 'rearrange', label: 'Rearrange', description: 'Put the words in the correct order.' },
  { value: 'translation', label: 'Translation', description: 'Translate the sentence into the target language.' },
];

const STEPS = ['Book', 'Chapter', 'Question type', 'Mode'];

export function PracticePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [books, setBooks] = useState<PracticeBookSummary[] | null>(null);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string>('');
  const [chapters, setChapters] = useState<PracticeChapterSummary[] | null>(null);
  const [allSelected, setAllSelected] = useState(true);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState<PracticeQuestionType | null>(null);
  const [mode, setMode] = useState<PracticeMode | null>(null);
  const [starting, setStarting] = useState(false);

  const loadBooks = useCallback(async () => {
    setBooks(null);
    setBooksError(null);
    try {
      const { books } = await listPracticeBooks();
      setBooks(books);
      if (books.length > 0 && !bookId) setBookId(books[0]._id);
    } catch (error) {
      setBooksError(getErrorMessage(error));
    }
  }, [bookId]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    setChapters(null);
    setAllSelected(true);
    setSelectedChapterIds([]);
    void (async () => {
      try {
        const { chapters } = await listPracticeChapters(bookId);
        if (!cancelled) setChapters(chapters);
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const toggleAllChapters = () => {
    if (!chapters) return;
    const next = !allSelected;
    setAllSelected(next);
    setSelectedChapterIds(next ? chapters.map((chapter) => chapter.id) : []);
  };

  const toggleChapter = (id: string) => {
    if (!chapters) return;
    if (allSelected) {
      const others = chapters.filter((chapter) => chapter.id !== id).map((chapter) => chapter.id);
      setAllSelected(false);
      setSelectedChapterIds(others);
      return;
    }
    setSelectedChapterIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const chapterOptions = chapters ?? [];
  const selectedChapters = allSelected ? chapterOptions.map((chapter) => chapter.id) : selectedChapterIds;

  const start = async () => {
    if (!bookId || !questionType || !mode) return;
    setStarting(true);
    try {
      const params: { bookId?: string; chapterIds?: string[]; questionType?: string; mode: string } = { mode, questionType };
      if (bookId) params.bookId = bookId;
      if (selectedChapters.length > 0) params.chapterIds = selectedChapters;
      const { sets } = await listPracticeSets(params);
      const set: PracticeQuestionSetSummary | undefined = sets[0];
      if (!set) {
        toast.error('No published questions found for this selection. Please try another combination.');
        return;
      }
      const { attempt } = await startPracticeAttempt({ setId: set._id, mode, chapters: selectedChapters });
      navigate(`/practice/attempt/${attempt._id}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setStarting(false);
    }
  };


  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 760, paddingTop: 28 }}>
        <span className="pg-badge pg-badge-mint" style={{ marginBottom: 10, display: 'inline-flex' }}>Practice &amp; Exam</span>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}>Practice time</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 18 }}>Small questions, instant cheers. Choose your book, chapters and question type.</p>

        <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '0 0 18px', flexWrap: 'wrap' }}>
          {STEPS.map((title, index) => (
            <li key={title} className="flex items-center gap-2">
              <span
                className="pg-step-dot"
                style={{
                  background: step === index + 1 ? 'var(--accent-candy)' : step > index + 1 ? 'var(--surface-mint-soft)' : 'var(--surface-cream)',
                  color: step >= index + 1 ? 'var(--pg-fg)' : 'var(--text-secondary)',
                }}
              >
                {index + 1}
              </span>
              <span style={{ fontWeight: step === index + 1 ? 800 : 600 }}>{title}</span>
            </li>
          ))}
        </ol>

        <div className="pg-card pg-card-yellow-shadow" style={{ padding: 20 }}>
          {step === 1 && (
            <>
              <h2 style={{ marginTop: 0 }}>Step 1: Choose your book</h2>
              {booksError ? (
                <EmptyState icon="📚" title="Could not load books" description={booksError} />
              ) : !books ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <SkeletonBox width="100%" height={44} />
                  <SkeletonBox width="70%" height={44} />
                </div>
              ) : books.length === 0 ? (
                <EmptyState icon="📚" title="No books yet" description="Ask your teacher to publish a book first. Practice sets will appear here later." />
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {books.map((book) => (
                    <button
                      key={book._id}
                      type="button"
                      onClick={() => setBookId(book._id)}
                      className="pg-card"
                      style={{ textAlign: 'left', padding: 14, cursor: 'pointer', border: bookId === book._id ? '2px solid var(--accent-candy)' : '1px solid var(--border-color)' }}
                    >
                      <strong>{book.title}</strong>
                      <span style={{ marginLeft: 8, color: 'var(--text-secondary)', fontSize: 13 }}>{book.subject} · Class 3</span>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <Button onClick={() => setStep(2)} disabled={!bookId}>Continue</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 style={{ marginTop: 0 }}>Step 2: Choose chapters</h2>
              {bookId ? (
                chapters === null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SkeletonBox width="100%" height={44} />
                    <SkeletonBox width="60%" height={44} />
                  </div>
                ) : chapters.length === 0 ? (
                  <EmptyState icon="📖" title="No chapters found" description="This book has no ingested chapters yet." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="flex items-center gap-3" style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--surface-cream)' }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAllChapters} style={{ width: 18, height: 18 }} />
                      <strong>All chapters</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{chapters.length} chapter(s)</span>
                    </label>
                    {chapters.map((chapter) => (
                      <label key={chapter.id} className="flex items-center gap-3" style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border-color)' }}>
                        <input type="checkbox" checked={allSelected || selectedChapterIds.includes(chapter.id)} disabled={allSelected} onChange={() => toggleChapter(chapter.id)} style={{ width: 18, height: 18 }} />
                        <span>Chapter {chapter.order + 1}: {chapter.title}</span>
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <EmptyState icon="📖" title="Pick a book first" description="Go back to step 1 to choose a book." />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={!chapters || chapters.length === 0}>Continue</Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 style={{ marginTop: 0 }}>Step 3: Choose question type</h2>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {QUESTION_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setQuestionType(type.value)}
                    className="pg-card"
                    style={{ padding: 14, cursor: 'pointer', textAlign: 'left', border: questionType === type.value ? '2px solid var(--accent-candy)' : '1px solid var(--border-color)', background: questionType === type.value ? 'var(--surface-mint-soft)' : undefined }}
                  >
                    <strong>{type.label}</strong>
                    <span style={{ display: 'block', marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>{type.description}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)} disabled={!questionType}>Continue</Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 style={{ marginTop: 0 }}>Step 4: Choose learning mode</h2>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <button
                  type="button"
                  onClick={() => setMode('practice')}
                  className="pg-card"
                  style={{ padding: 16, cursor: 'pointer', border: mode === 'practice' ? '2px solid var(--accent-candy)' : '1px solid var(--border-color)', background: mode === 'practice' ? 'var(--surface-mint-soft)' : undefined }}
                >
                  <strong>Practice Mode</strong>
                  <span style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>Answer at your own pace and get instant feedback after submitting.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('exam')}
                  className="pg-card"
                  style={{ padding: 16, cursor: 'pointer', border: mode === 'exam' ? '2px solid var(--accent-candy)' : '1px solid var(--border-color)', background: mode === 'exam' ? 'var(--surface-pink-soft)' : undefined }}
                >
                  <strong>Exam Mode</strong>
                  <span style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>Answer all questions together and submit before the timer ends.</span>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
                <Button onClick={() => void start()} disabled={!mode || starting}>
                  {starting ? 'Starting…' : mode === 'exam' ? 'Start Exam' : 'Start Practice'}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="pg-card" style={{ marginTop: 16, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800 }}>Your plan</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Book: {books?.find((b) => b._id === bookId)?.title ?? '—'}
              {chapters !== null && ` · ${allSelected ? 'All chapters' : `${selectedChapterIds.length} chapter(s)`}`}
              {questionType ? ` · ${QUESTION_TYPES.find((t) => t.value === questionType)?.label}` : ''}
              {mode ? ` · ${mode === 'exam' ? 'Exam Mode' : 'Practice Mode'}` : ''}
            </div>
          </div>
          <Link to="/tutor" className="pg-btn-secondary" style={{ textDecoration: 'none' }}>Back to tutor</Link>
        </div>
      </div>
    </div>
  );
}
