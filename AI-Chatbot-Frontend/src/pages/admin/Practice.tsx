import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { SkeletonBox } from '@/components/ui/Skeleton';
import {
  deleteAdminPracticeQuestion,
  deleteAdminPracticeSet,
  duplicateAdminPracticeQuestion,
  duplicateAdminPracticeSet,
  getErrorMessage,
  listAdminPracticeQuestions,
  listAdminPracticeSets,
  listPracticeChapters,
  previewAdminPracticeSet,
  publishAdminPracticeSet,
  reorderAdminPracticeQuestions,
  unpublishAdminPracticeSet,
  type AdminPracticeSetRow,
  type PracticeAttempt,
} from '@/lib/api';
import { adminListBooks } from '@/lib/tutor';
import type { AdminBook } from '@/types';
import { PracticeSetEditor } from '@/pages/admin/PracticeSetEditor';
import { PracticeQuestionBuilder } from '@/pages/admin/PracticeQuestionBuilder';

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  fill_blank: 'Fill blanks',
  true_false: 'True / False',
  matching: 'Matching',
  one_word: 'One word',
  rearrange: 'Rearrange',
  translation: 'Translation',
};

function isDraftSet(set: AdminPracticeSetRow): boolean {
  return set.draft ?? set.publicationState !== 'published';
}

function questionPreview(question: Record<string, unknown>): string {
  const type = String(question.questionType ?? '');
  if (type === 'mcq' || type === 'one_word') return String(question.question ?? '');
  if (type === 'fill_blank') return String(question.text ?? '');
  if (type === 'true_false') return String(question.statement ?? '');
  if (type === 'translation') return String(question.source ?? question.question ?? '');
  if (type === 'matching') return 'Match the items in Column A with Column B.';
  if (type === 'rearrange') return 'Put the items in the correct order.';
  return '';
}

function questionAnswer(question: Record<string, unknown>): string {
  const type = String(question.questionType ?? '');
  if (type === 'mcq') {
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    const index = Number(question.correctIndex ?? 0);
    return options[index] ?? `Option ${index + 1}`;
  }
  if (type === 'fill_blank') {
    const blanks = Array.isArray(question.blanks) ? (question.blanks as Array<Record<string, unknown>>) : [];
    return blanks
      .map((blank, index) => {
        const accepted = Array.isArray(blank.accepted) ? blank.accepted.map(String) : [];
        return `Blank ${index + 1}: ${accepted.join(' / ')}`;
      })
      .join(' · ');
  }
  if (type === 'true_false') return question.correct ? 'True' : 'False';
  if (type === 'matching') {
    const pairs = Array.isArray(question.pairs) ? (question.pairs as Array<Record<string, unknown>>) : [];
    return pairs.map((pair) => `${String(pair.left ?? '')} → ${String(pair.right ?? '')}`).join(' · ');
  }
  if (type === 'one_word' || type === 'translation') {
    const alternatives = Array.isArray(question.alternatives) ? question.alternatives.map(String) : [];
    const answer = String(question.answer ?? '');
    return [answer, ...alternatives].filter(Boolean).join(' / ');
  }
  if (type === 'rearrange') {
    const items = Array.isArray(question.items) ? question.items.map(String) : [];
    return items.join(' → ');
  }
  return '';
}

export function PracticeAdminPage() {
  const navigate = useNavigate();
  const [sets, setSets] = useState<AdminPracticeSetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [books, setBooks] = useState<AdminBook[]>([]);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [bookId, setBookId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [chapters, setChapters] = useState<Array<{ id: string; title: string; order: number }>>([]);

  const [questionType, setQuestionType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<AdminPracticeSetRow | null>(null);

  const [managingSet, setManagingSet] = useState<AdminPracticeSetRow | null>(null);
  const [questions, setQuestions] = useState<Array<Record<string, unknown>>>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderMode, setBuilderMode] = useState<'create' | 'edit'>('create');
  const [editingQuestion, setEditingQuestion] = useState<Record<string, unknown> | null>(null);

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminPracticeSets({
        bookId: bookId || undefined,
        chapterIds: chapterId || undefined,
        questionType: questionType || undefined,
        status: status || undefined,
        search: search.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setSets(Array.isArray(result.sets) ? result.sets : []);
      setTotal(Number(result.total ?? 0));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterId, questionType, status, search, page]);

  // Small debounce keeps typing in the search field from firing a request per key.
  useEffect(() => {
    const timer = setTimeout(() => void loadSets(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadSets, search]);

  useEffect(() => {
    void adminListBooks()
      .then((list) => setBooks(list.filter((book) => book.publicationState !== 'archived')))
      .catch((err) => setBooksError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (!bookId) {
      setChapters([]);
      setChapterId('');
      return;
    }
    let cancelled = false;
    void listPracticeChapters(bookId)
      .then((payload) => {
        if (cancelled) return;
        setChapters(payload.chapters);
        setChapterId((current) => (payload.chapters.some((chapter) => chapter.id === current) ? current : ''));
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const resetFilters = () => {
    setBookId('');
    setChapterId('');
    setQuestionType('');
    setStatus('');
    setSearch('');
    setPage(1);
  };

  const openCreate = () => {
    setEditingSet(null);
    setEditorOpen(true);
  };

  const openEdit = (set: AdminPracticeSetRow) => {
    setEditingSet(set);
    setEditorOpen(true);
  };

  const runPublishAction = async (action: 'publish' | 'unpublish', set: AdminPracticeSetRow) => {
    try {
      if (action === 'publish') {
        await publishAdminPracticeSet(set._id);
        toast.success(`Published "${set.title}".`);
      } else {
        await unpublishAdminPracticeSet(set._id);
        toast.success(`Moved "${set.title}" back to draft.`);
      }
      await loadSets();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const removeSet = async (set: AdminPracticeSetRow) => {
    if (!window.confirm(`Delete question set "${set.title}"? This cannot be undone.`)) return;
    try {
      await deleteAdminPracticeSet(set._id);
      toast.success('Question set deleted.');
      if (managingSet?._id === set._id) setManagingSet(null);
      await loadSets();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const copySet = async (set: AdminPracticeSetRow) => {
    try {
      const { set: copy } = await duplicateAdminPracticeSet(set._id);
      toast.success(`Created "${copy.title}".`);
      await loadSets();
      if (copy) await openQuestions(copy);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const startPreview = async (set: AdminPracticeSetRow) => {
    try {
      const { attempt } = await previewAdminPracticeSet(set._id);
      navigate(`/practice/attempt/${(attempt as PracticeAttempt)._id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const loadQuestions = async (set: AdminPracticeSetRow) => {
    setQuestionsLoading(true);
    setQuestionError(null);
    try {
      const { questions: rows } = await listAdminPracticeQuestions(set._id);
      setQuestions(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setQuestionError(getErrorMessage(err));
    } finally {
      setQuestionsLoading(false);
    }
  };

  const openQuestions = async (set: AdminPracticeSetRow) => {
    setManagingSet(set);
    setQuestions([]);
    await loadQuestions(set);
  };

  const refreshQuestions = async () => {
    if (!managingSet) return;
    await loadQuestions(managingSet);
    await loadSets();
  };

  const duplicateQuestion = async (question: Record<string, unknown>) => {
    if (!managingSet) return;
    try {
      await duplicateAdminPracticeQuestion(managingSet._id, String(question._id));
      toast.success('Question duplicated.');
      await loadQuestions(managingSet);
      await loadSets();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const deleteQuestion = async (question: Record<string, unknown>) => {
    if (!managingSet) return;
    if (!window.confirm('Delete this question?')) return;
    try {
      await deleteAdminPracticeQuestion(managingSet._id, String(question._id));
      toast.success('Question deleted.');
      await loadQuestions(managingSet);
      await loadSets();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const moveQuestion = async (index: number, direction: -1 | 1) => {
    if (!managingSet) return;
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setQuestions(reordered);
    try {
      await reorderAdminPracticeQuestions(managingSet._id, reordered.map((question) => String(question._id)));
      toast.success('Question order updated.');
    } catch (err) {
      toast.error(getErrorMessage(err));
      await loadQuestions(managingSet);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const questionMarks = useMemo(
    () => questions.reduce((sum, question) => sum + Number(question.marks ?? 0), 0),
    [questions]
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Practice &amp; Exams</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
            Create question sets, add questions, preview, publish and manage student practice and exams.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => void loadSets()}>Refresh</Button>
          <Button onClick={openCreate} disabled={books.length === 0}>New question set</Button>
        </div>
      </div>

      {booksError && (
        <div role="alert" style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: 'var(--surface-danger, #fee2e2)', color: 'var(--text-danger, #991b1b)' }}>
          Could not load books: {booksError}
        </div>
      )}
      {!booksError && books.length === 0 && !loading && (
        <div className="pg-card" style={{ padding: 14, marginBottom: 16 }}>
          <strong>No books available.</strong>{' '}
          <span className="text-muted">Import and publish a book from Admin → Books before creating question sets.</span>
        </div>
      )}

      <div className="pg-card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Book">
            <Select aria-label="Filter by book" value={bookId} onChange={(e) => { setBookId(e.target.value); setChapterId(''); setPage(1); }}>
              <option value="">All books</option>
              {books.map((book) => (
                <option key={book._id} value={book._id}>
                  {book.title}{book.publicationState !== 'published' ? ' (draft)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chapter">
            <Select aria-label="Filter by chapter" value={chapterId} onChange={(e) => { setChapterId(e.target.value); setPage(1); }} disabled={!bookId}>
              <option value="">All chapters</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.order > 0 ? `${chapter.order}. ` : ''}{chapter.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Question type">
            <Select aria-label="Filter by question type" value={questionType} onChange={(e) => { setQuestionType(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </Field>
          <Field label="Search">
            <Input aria-label="Search question sets" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Title or book" />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => void loadSets()}>Apply</Button>
            <Button variant="secondary" onClick={resetFilters}>Reset</Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="pg-card" style={{ padding: 16 }}>
          <SkeletonBox width="100%" height={40} />
          <SkeletonBox width="90%" height={40} />
          <SkeletonBox width="80%" height={40} />
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="Could not load question sets" description={error} />
      ) : sets.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No question sets yet"
          description="Create a draft set, add questions in the set type, then publish it for students."
        />
      ) : (
        <>
          <div className="pg-card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <th style={{ padding: 10 }}>Title</th>
                  <th style={{ padding: 10 }}>Book</th>
                  <th style={{ padding: 10 }}>Type</th>
                  <th style={{ padding: 10 }}>Chapters</th>
                  <th style={{ padding: 10 }}>Questions</th>
                  <th style={{ padding: 10 }}>Marks</th>
                  <th style={{ padding: 10 }}>Status</th>
                  <th style={{ padding: 10 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((set) => {
                  const draft = isDraftSet(set);
                  return (
                    <tr key={set._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: 10, fontWeight: 700 }}>{set.title}</td>
                      <td style={{ padding: 10 }}>{set.bookTitle}</td>
                      <td style={{ padding: 10 }}>{TYPE_LABELS[set.questionType] ?? set.questionType}</td>
                      <td style={{ padding: 10 }}>{set.chapters?.length ?? 0}</td>
                      <td style={{ padding: 10 }}>{set.totalQuestions ?? 0}</td>
                      <td style={{ padding: 10 }}>{set.totalMarks ?? 0}</td>
                      <td style={{ padding: 10 }}>
                        <Badge variant={draft ? 'warning' : 'success'}>{draft ? 'Draft' : 'Published'}</Badge>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Button size="sm" onClick={() => void openQuestions(set)}>Questions</Button>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(set)}>Edit</Button>
                          <Button size="sm" variant="secondary" onClick={() => void startPreview(set)}>Preview</Button>
                          <Button size="sm" variant="secondary" onClick={() => void copySet(set)}>Duplicate</Button>
                          {draft ? (
                            <Button
                              size="sm"
                              onClick={() => void runPublishAction('publish', set)}
                              disabled={(set.totalQuestions ?? 0) === 0}
                              title={(set.totalQuestions ?? 0) === 0 ? 'Add at least one question before publishing' : 'Publish this set'}
                            >
                              Publish
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => void runPublishAction('unpublish', set)}>Unpublish</Button>
                          )}
                          <Button size="sm" variant="danger" onClick={() => void removeSet(set)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="text-muted small">{total} set(s) · page {page} of {pages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</Button>
              <Button size="sm" variant="secondary" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages}>Next</Button>
            </div>
          </div>
        </>
      )}

      <PracticeSetEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initial={editingSet}
        onSaved={async (created) => {
          await loadSets();
          if (created) {
            await openQuestions(created);
          }
        }}
      />

      <Modal
        open={Boolean(managingSet)}
        onClose={() => setManagingSet(null)}
        title={managingSet ? `Questions · ${managingSet.title}` : ''}
        maxWidth={820}
      >
        {managingSet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {questionError && (
              <div role="alert" style={{ padding: 10, borderRadius: 12, background: 'var(--surface-danger, #fee2e2)', color: 'var(--text-danger, #991b1b)' }}>
                {questionError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="text-muted small">
                {questions.length} question(s) · {questionMarks} mark(s) · {isDraftSet(managingSet) ? 'Draft' : 'Published'}
              </div>
              <Button size="sm" onClick={() => { setBuilderMode('create'); setEditingQuestion(null); setBuilderOpen(true); }}>
                Add question
              </Button>
            </div>

            {questionsLoading ? (
              <div className="pg-card" style={{ padding: 16 }}>
                <SkeletonBox width="100%" height={40} />
                <SkeletonBox width="80%" height={40} />
              </div>
            ) : questions.length === 0 ? (
              <EmptyState icon="❓" title="No questions yet" description="Add the first question for this set." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
                {questions.map((question, index) => (
                  <div key={String(question._id ?? index)} className="pg-card" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <strong>{index + 1}. {TYPE_LABELS[String(question.questionType)] ?? String(question.questionType)}</strong>
                      <span className="text-muted small">
                        {Number(question.marks ?? 0)} marks
                        {question.chapterTitle ? ` · ${String(question.chapterTitle)}` : ''}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14 }}>{questionPreview(question)}</div>
                    {question.questionType === 'mcq' && Array.isArray(question.options) && (
                      <ol style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                        {question.options.map((option, optionIndex) => (
                          <li key={optionIndex} style={{ fontWeight: Number(question.correctIndex) === optionIndex ? 700 : 400, color: Number(question.correctIndex) === optionIndex ? 'var(--text-primary)' : undefined }}>
                            {String(option)}{Number(question.correctIndex) === optionIndex ? ' ✓' : ''}
                          </li>
                        ))}
                      </ol>
                    )}
                    <div
                      style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: 'var(--surface-subtle)',
                        fontSize: 13,
                        whiteSpace: 'normal',
                      }}
                    >
                      <strong>Answer:</strong> {questionAnswer(question) || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => { setBuilderMode('edit'); setEditingQuestion(question); setBuilderOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="secondary" onClick={() => void duplicateQuestion(question)}>Duplicate</Button>
                      <Button size="sm" variant="secondary" onClick={() => void moveQuestion(index, -1)} disabled={index === 0}>Move up</Button>
                      <Button size="sm" variant="secondary" onClick={() => void moveQuestion(index, 1)} disabled={index === questions.length - 1}>Move down</Button>
                      <Button size="sm" variant="danger" onClick={() => void deleteQuestion(question)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isDraftSet(managingSet) && questions.length > 0 && (
              <p className="text-muted small">This set is still a draft. Use Publish in the list when you are ready for students to see it.</p>
            )}
          </div>
        )}
      </Modal>

      <PracticeQuestionBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onSaved={() => void refreshQuestions()}
        set={managingSet}
        existingQuestion={builderMode === 'edit' ? editingQuestion : null}
        mode={builderMode}
      />
    </div>
  );
}

export default PracticeAdminPage;
