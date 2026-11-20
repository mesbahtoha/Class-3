import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { SkeletonBox } from '@/components/ui/Skeleton';
import { deleteAdminPracticeSet, getErrorMessage, listAdminPracticeQuestions, listAdminPracticeSets, previewAdminPracticeSet, publishAdminPracticeSet, unpublishAdminPracticeSet, duplicateAdminPracticeQuestion, deleteAdminPracticeQuestion } from '@/lib/api';
import { adminListBooks } from '@/lib/tutor';
import type { AdminPracticeSetRow, PracticeAttempt } from '@/lib/api';
import type { AdminBook } from '@/types';
import { PracticeSetEditor } from '@/pages/admin/PracticeSetEditor';
import { PracticeQuestionBuilder } from '@/pages/admin/PracticeQuestionBuilder';

function BookFilterSelect({ books, value, onChange }: { books: AdminBook[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All books</option>
      {books.map((book) => (
        <option key={book._id} value={book._id}>{book.title}</option>
      ))}
    </Select>
  );
}

function TypeFilterSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All types</option>
      <option value="mcq">Multiple Choice</option>
      <option value="fill_blank">Fill in the Blanks</option>
      <option value="true_false">True / False</option>
      <option value="matching">Matching</option>
      <option value="one_word">One Word Answer</option>
      <option value="rearrange">Rearrange</option>
      <option value="translation">Translation</option>
    </Select>
  );
}

function StatusFilterSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All statuses</option>
      <option value="draft">Draft</option>
      <option value="published">Published</option>
    </Select>
  );
}

export function PracticeAdminPage() {
  const navigate = useNavigate();
  const [sets, setSets] = useState<AdminPracticeSetRow[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [bookId, setBookId] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<AdminPracticeSetRow | null>(null);
  const [managingSet, setManagingSet] = useState<AdminPracticeSetRow | null>(null);
  const [questions, setQuestions] = useState<Array<Record<string, unknown>>>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderMode, setBuilderMode] = useState<'create' | 'edit'>('create');
  const [editingQuestion, setEditingQuestion] = useState<Record<string, unknown> | null>(null);

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminPracticeSets({ bookId: bookId || undefined, questionType: questionType || undefined, status: status || undefined, search: search || undefined, page: 1, limit: 50 });
      setSets(result.sets);
      setTotal(result.total);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [bookId, questionType, status, search]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  useEffect(() => {
    void adminListBooks({ publicationState: 'published' }).then((list) => setBooks(list));
  }, []);

  const openCreate = () => {
    setEditingSet(null);
    setEditorOpen(true);
  };

  const openEdit = (set: AdminPracticeSetRow) => {
    setEditingSet(set);
    setEditorOpen(true);
  };

  const runAction = async (action: 'publish' | 'unpublish', set: AdminPracticeSetRow) => {
    try {
      if (action === 'publish') {
        const { set: updated } = await publishAdminPracticeSet(set._id);
        toast.success(`Published "${updated.title}".`);
      } else {
        const { set: updated } = await unpublishAdminPracticeSet(set._id);
        toast.success(`Unpublished "${updated.title}".`);
      }
      await loadSets();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const removeSet = async (set: AdminPracticeSetRow) => {
    if (!window.confirm(`Delete question set "${set.title}"? This cannot be undone.`)) return;
    try {
      const { deleted } = await deleteAdminPracticeSet(set._id);
      if (deleted) toast.success('Question set deleted.');
      await loadSets();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const startPreview = async (set: AdminPracticeSetRow) => {
    try {
      const { attempt } = await previewAdminPracticeSet(set._id);
      toast.success('Preview started. Answer the questions to see evaluation.');
      navigate(`/practice/attempt/${(attempt as PracticeAttempt)._id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const openQuestions = async (set: AdminPracticeSetRow) => {
    setManagingSet(set);
    setQuestions([]);
    try {
      const { questions: rows } = await listAdminPracticeQuestions(set._id);
      setQuestions(rows);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const duplicateQuestion = async (question: Record<string, unknown>) => {
    if (!managingSet) return;
    try {
      const { question: copy } = await duplicateAdminPracticeQuestion(String(managingSet._id), String(question._id));
      void copy;
      toast.success('Question duplicated.');
      const { questions: refreshed } = await listAdminPracticeQuestions(String(managingSet._id));
      setQuestions(refreshed);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const deleteQuestion = async (question: Record<string, unknown>) => {
    if (!managingSet) return;
    try {
      const { deleted } = await deleteAdminPracticeQuestion(String(managingSet._id), String(question._id));
      if (deleted) {
        const { questions: refreshed } = await listAdminPracticeQuestions(String(managingSet._id));
        setQuestions(refreshed);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Practice &amp; Exams</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Create, publish and manage question sets for student practice and exams.</p>
        </div>
        <Button onClick={openCreate}>New question set</Button>
      </div>

      <div className="pg-card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
          <Field label="Book">
            <BookFilterSelect books={books} value={bookId} onChange={setBookId} />
          </Field>
          <Field label="Question type">
            <TypeFilterSelect value={questionType} onChange={setQuestionType} />
          </Field>
          <Field label="Status">
            <StatusFilterSelect value={status} onChange={setStatus} />
          </Field>
          <Field label="Search">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Set title" />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => void loadSets()}>Apply</Button>
            <Button variant="secondary" onClick={() => { setBookId(''); setQuestionType(''); setStatus(''); setSearch(''); }}>Reset</Button>
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
        <EmptyState icon="📚" title="No question sets yet" description="Create your first practice or exam question set." />
      ) : (
        <div className="pg-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
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
              {sets.map((set) => (
                <tr key={set._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 10, fontWeight: 700 }}>{set.title}</td>
                  <td style={{ padding: 10 }}>{set.bookTitle}</td>
                  <td style={{ padding: 10 }}>{set.questionType}</td>
                  <td style={{ padding: 10 }}>{set.chapters?.length ?? 0}</td>
                  <td style={{ padding: 10 }}>{set.totalQuestions ?? set.questionCount ?? 0}</td>
                  <td style={{ padding: 10 }}>{set.totalMarks ?? 0}</td>
                  <td style={{ padding: 10 }}>
                    <Badge variant={set.draft ? 'warning' : 'success'}>{set.draft ? 'Draft' : 'Published'}</Badge>
                  </td>
                  <td style={{ padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button size="sm" variant="secondary" onClick={() => void startPreview(set)}>Preview</Button>
                    {!set.draft ? (
                      <Button size="sm" variant="secondary" onClick={() => void runAction('unpublish', set)}>Unpublish</Button>
                    ) : (
                      <Button size="sm" onClick={() => void runAction('publish', set)}>Publish</Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => void openQuestions(set)}>Questions</Button>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(set)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => void removeSet(set)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PracticeSetEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => void loadSets()} initial={editingSet} />

      <Modal open={Boolean(managingSet)} onClose={() => setManagingSet(null)} title={managingSet ? `Questions · ${managingSet.title}` : ''} maxWidth={720}>
        {managingSet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="sm" onClick={() => { setBuilderMode('create'); setEditingQuestion(null); setBuilderOpen(true); }}>Add question</Button>
            </div>
            {questions.length === 0 ? (
              <EmptyState icon="❓" title="No questions yet" description="Add the first question for this set." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {questions.map((question, index) => (
                  <div key={String(question._id ?? index)} className="pg-card" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{index + 1}. {String(question.questionType ?? '')}</strong>
                      <span className="text-muted">{Number(question.marks ?? 0)} marks</span>
                    </div>
                    <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>{String(question.question ?? question.text ?? question.source ?? '')}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => { setBuilderMode('edit'); setEditingQuestion(question); setBuilderOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="secondary" onClick={() => void duplicateQuestion(question)}>Duplicate</Button>
                      <Button size="sm" variant="danger" onClick={() => void deleteQuestion(question)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <PracticeQuestionBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onSaved={() => { if (managingSet) void openQuestions(managingSet); }}
        set={managingSet}
        existingQuestion={builderMode === 'edit' ? editingQuestion : null}
        mode={builderMode}
      />
    </div>
  );
}

export default PracticeAdminPage;
