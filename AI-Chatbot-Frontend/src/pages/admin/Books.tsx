import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  adminArchiveBook,
  adminDeleteBook,
  adminGetBook,
  adminListBooks,
  adminPublishBook,
  adminReindexBook,
  adminUnpublishBook,
  adminUploadBook,
} from '@/lib/tutor';
import { getErrorMessage, isRouteNotFoundError } from '@/lib/api';
import { StaleBackendNotice } from '@/components/ui/StaleBackendNotice';
import type { AdminBook, IngestionJob } from '@/types';

function stateBadge(book: AdminBook) {
  if (book.publicationState === 'published') return <Badge variant="success">প্রকাশিত</Badge>;
  if (book.publicationState === 'archived') return <Badge variant="muted">আর্কাইভ</Badge>;
  if (book.processingState === 'failed') return <Badge variant="danger">ব্যর্থ</Badge>;
  if (book.processingState !== 'ready') return <Badge variant="warning">প্রসেসিং</Badge>;
  return <Badge variant="info">খসড়া</Badge>;
}

export function AdminBooks() {
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detail, setDetail] = useState<{ book: AdminBook; jobs: IngestionJob[]; samples: { chunkId: string; chunkIndex: number; chapterTitle?: string; pageStart?: number; pageEnd?: number; preview: string }[] } | null>(null);
  const [form, setForm] = useState({ title: '', subject: 'গণিত', grade: 'Class 3', curriculum: 'NCTB', language: 'bn', edition: '', publisher: '', rightsStatus: 'unverified' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [staleBackend, setStaleBackend] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setStaleBackend(false);
    try {
      setBooks(await adminListBooks({ search: search || undefined }));
    } catch (e) {
      if (isRouteNotFoundError(e)) {
        setStaleBackend(true);
        setBooks([]);
      } else {
        toast.error(getErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (id: string) => {
    try {
      setDetail(await adminGetBook(id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const doAction = async (id: string, action: () => Promise<unknown>, label: string) => {
    setBusy(id + label);
    try {
      await action();
      toast.success(label + ' সফল');
      await refresh();
      if (detail) setDetail(await adminGetBook(id));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const upload = async () => {
    if (!form.title.trim() || !form.subject.trim() || !file) {
      toast.error('শিরোনাম, বিষয় ও PDF ফাইল দাও');
      return;
    }
    setBusy('upload');
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) fd.append(k, v);
      fd.append('file', file);
      const r = await adminUploadBook(fd);
      toast.success(`আপলোড হয়েছে। প্রসেসিং চলছে (job ${r.jobId.slice(-6)})`);
      setUploadOpen(false);
      setFile(null);
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 20 }}>📚 বই ব্যবস্থাপনা</h1>
        <Button onClick={() => setUploadOpen(true)}>＋ নতুন বই</Button>
      </div>
      <div className="flex gap-2" style={{ marginBottom: 12 }}>
        <Input placeholder="খোঁজো…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        <Button variant="secondary" onClick={() => void refresh()}>খোঁজো</Button>
      </div>
      {loading ? (
        <p className="text-muted">লোড হচ্ছে…</p>
      ) : staleBackend ? (
        <StaleBackendNotice feature="বই ব্যবস্থাপনা" onRetry={() => void refresh()} />
      ) : books.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p className="text-muted">কোনো বই নেই। “নতুন বই” চাপ দিয়ে PDF আপলোড করো।</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13.5 }}>
            <thead>
              <tr className="text-muted" style={{ textAlign: 'left' }}>
                <th style={{ padding: 10 }}>শিরোনাম</th>
                <th style={{ padding: 10 }}>বিষয়</th>
                <th style={{ padding: 10 }}>অবস্থা</th>
                <th style={{ padding: 10 }}>চাঙ্ক</th>
                <th style={{ padding: 10 }}>কাজ</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b._id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => void openDetail(b._id)} style={{ padding: 0 }}>
                      {b.title}
                    </button>
                    <div className="text-xs text-muted">{b.grade} • {b.curriculum}{b.edition ? ` • ${b.edition}` : ''}</div>
                  </td>
                  <td style={{ padding: 10 }}>{b.subject}</td>
                  <td style={{ padding: 10 }}>{stateBadge(b)}</td>
                  <td style={{ padding: 10 }}>{b.chunkCount ?? 0}</td>
                  <td style={{ padding: 10 }}>
                    <div className="flex flex-wrap" style={{ gap: 4 }}>
                      <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void doAction(b._id, () => adminPublishBook(b._id), 'প্রকাশ')}>প্রকাশ</Button>
                      <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void doAction(b._id, () => adminUnpublishBook(b._id), 'অপ্রকাশ')}>অপ্রকাশ</Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void doAction(b._id, () => adminReindexBook(b._id), 'রি-ইনডেক্স')}>রি-ইনডেক্স</Button>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void doAction(b._id, () => adminArchiveBook(b._id), 'আর্কাইভ')}>আর্কাইভ</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() => {
                          if (window.confirm(`"${b.title}" মুছে ফেলবে? চাঙ্কসহ সব মুছে যাবে।`)) {
                            void doAction(b._id, () => adminDeleteBook(b._id), 'মোছা');
                          }
                        }}
                      >
                        মুছো
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="নতুন বই আপলোড (PDF)">
        <div className="flex flex-col" style={{ gap: 10 }}>
          <Input placeholder="শিরোনাম *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="flex gap-2">
            <Input placeholder="বিষয় *" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <Input placeholder="শ্রেণি" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Input placeholder="কারিকুলাম" value={form.curriculum} onChange={(e) => setForm({ ...form, curriculum: e.target.value })} />
            <Input placeholder="ভাষা (bn/en)" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Input placeholder="সংস্করণ" value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} />
            <Input placeholder="প্রকাশক" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
          </div>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="PDF ফাইল" />
          <p className="text-xs text-muted">শুধু PDF (সর্বোচ্চ ৩০MB)। সার্ভারে ফাইল যাচাই হবে। প্রসেসিং ব্যাকগ্রাউন্ডে চলবে।</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>বাতিল</Button>
            <Button onClick={() => void upload()} disabled={busy === 'upload'}>{busy === 'upload' ? 'আপলোড হচ্ছে…' : 'আপলোড'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.book.title ?? 'বই'}>
        {detail && (
          <div style={{ fontSize: 13.5 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              {stateBadge(detail.book)}
              <span className="text-xs text-muted">
                {detail.book.processingState} • {detail.book.processingProgress ?? 0}% • {detail.book.chunkCount ?? 0} চাঙ্ক • {detail.book.pageCount ?? 0} পৃষ্ঠা
              </span>
            </div>
            {detail.book.processingError && <p style={{ color: '#e5484d' }}>⚠️ {detail.book.processingError}</p>}
            <div className="font-semibold" style={{ margin: '10px 0 4px' }}>প্রসেসিং কাজ</div>
            {detail.jobs.length === 0 && <p className="text-muted">কোনো কাজ নেই।</p>}
            {detail.jobs.map((j) => (
              <div key={j._id} className="text-xs" style={{ padding: '6px 0', borderTop: '1px solid var(--border-color)' }}>
                {j.kind} • {j.state} • {j.progress}% • {j.errorMessage || j.warnings?.join(' | ') || 'Not set'}
              </div>
            ))}
            <div className="font-semibold" style={{ margin: '10px 0 4px' }}>নমুনা টেক্সট (প্রথম ৮ চাঙ্ক)</div>
            {detail.samples.map((s) => (
              <div key={s.chunkId} style={{ padding: '6px 0', borderTop: '1px solid var(--border-color)' }}>
                <div className="text-xs text-muted">#{s.chunkIndex}{s.chapterTitle ? ` • ${s.chapterTitle}` : ''}{s.pageStart ? ` • পৃষ্ঠা ${s.pageStart}` : ''}</div>
                <div>{s.preview}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
