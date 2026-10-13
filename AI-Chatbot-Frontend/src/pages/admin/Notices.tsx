import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FaFileAlt, FaFilePdf, FaFileImage, FaPlus } from 'react-icons/fa';
import { MdDelete, MdRefresh } from 'react-icons/md';
import { apiDelete, apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Field, Input, Select, Textarea } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/format';
import { API_BASE_URL } from '@/lib/api';

interface NoticeRow {
  _id: string;
  title: string;
  category: string;
  type: string;
  mimeType?: string;
  summary?: string;
  createdAt: string;
  fileId?: string | null;
  hasFullText?: boolean;
  chunkCount?: number;
}

const CATEGORIES = ['general', 'exam', 'routine', 'result', 'admission', 'scholarship'];

function typeIcon(notice: NoticeRow) {
  const t = notice.type;
  if (t === 'pdf') return <FaFilePdf style={{ color: 'var(--color-danger)' }} />;
  if (t === 'image') return <FaFileImage style={{ color: 'var(--color-info)' }} />;
  return <FaFileAlt style={{ color: 'var(--color-primary)' }} />;
}

export function AdminNotices() {
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = category ? `?category=${encodeURIComponent(category)}` : '';
      const payload = await apiGet<{ notices: NoticeRow[] }>(`/api/v1/admin/notices${params}`);
      setNotices(payload.notices ?? []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!file && !textContent.trim()) {
      toast.error('Provide either a file or notice text');
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('category', category || 'general');
      if (textContent.trim()) form.append('textContent', textContent.trim());
      if (file) form.append('file', file);

      const { api } = await import('@/lib/api');
      await api.post('/api/v1/admin/notices', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Notice created');
      setCreateOpen(false);
      setTitle('');
      setTextContent('');
      setFile(null);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const reindex = async (notice: NoticeRow) => {
    try {
      const payload = await apiPost<{ chunkCount: number }>(`/api/v1/admin/notices/${notice._id}/reindex`);
      toast.success(`Reindexed. ${payload.chunkCount} chunks created`);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const remove = async (notice: NoticeRow) => {
    if (!window.confirm(`Delete "${notice.title}"?`)) return;
    try {
      await apiDelete(`/api/v1/admin/notices/${notice._id}`);
      toast.success('Notice deleted');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <h2>Notices &amp; documents</h2>
          <span className="text-sm text-muted">{notices.length} notices · fed to the AI assistant</span>
        </div>
        <div className="page-header-actions">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 160 }}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <FaPlus /> New notice
          </Button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : notices.length === 0 ? (
          <EmptyState
            icon={<FaFileAlt />}
            title="No notices yet"
            description="Upload PDFs, images or paste notice text. The assistant will answer from them."
            action={<Button onClick={() => setCreateOpen(true)}><FaPlus /> Add your first notice</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Notice</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Searchable</th>
                  <th>Added</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((notice) => (
                  <tr key={notice._id}>
                    <td>
                      <div className="flex items-center gap-2" style={{ minWidth: 220 }}>
                        {typeIcon(notice)}
                        <div style={{ minWidth: 0 }}>
                          <div className="font-semibold ellipsis" style={{ fontSize: 13.5, maxWidth: 320 }} title={notice.title}>
                            {notice.title}
                          </div>
                          {notice.summary && (
                            <div className="text-xs text-muted ellipsis" style={{ maxWidth: 320 }}>
                              {notice.summary}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><Badge variant="primary">{notice.category}</Badge></td>
                    <td className="text-sm text-secondary">{notice.type}{notice.mimeType ? ` · ${notice.mimeType.split('/')[1]}` : ''}</td>
                    <td>
                      {notice.hasFullText ? (
                        <Badge variant="success">{notice.chunkCount ?? 0} chunks</Badge>
                      ) : (
                        <Badge variant="warning">Not indexed</Badge>
                      )}
                    </td>
                    <td className="text-sm text-secondary">{formatDate(notice.createdAt)}</td>
                    <td>
                      <div className="flex justify-end" style={{ gap: 6 }}>
                        {notice.fileId && (
                          <a
                            className="btn btn-secondary btn-sm"
                            href={`${API_BASE_URL}/api/files/${notice.fileId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void reindex(notice)}>
                          <MdRefresh size={14} /> Reindex
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void remove(notice)}>
                          <MdDelete size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add a notice">
        <form onSubmit={(e) => void create(e)}>
          <Field label="Title" hint="e.g. Spring 2026 Final Exam Routine">
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="File (PDF / image / text)" hint="Or paste the notice text below">
            <Input type="file" accept=".pdf,.txt,.md,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Notice text" hint="Used when no file is provided">
            <Textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Paste the full notice content here…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create notice</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
