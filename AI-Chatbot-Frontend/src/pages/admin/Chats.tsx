import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FaComments } from 'react-icons/fa';
import { apiGet, getErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Form';
import { formatDateTime, truncate } from '@/lib/format';
import type { MessageFeedback } from '@/types';

interface ChatRow {
  id: string;
  role: string;
  content: string;
  model?: string;
  status?: string;
  feedback?: MessageFeedback | null;
  totalTokens?: number;
  createdAt: string;
  conversationId?: string | null;
  conversationTitle?: string | null;
}

export function AdminChats() {
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      const payload = await apiGet<{ items: ChatRow[]; total: number }>(
        `/api/v1/admin/chats?${params.toString()}`
      );
      setRows(payload.items);
      setTotal(payload.total);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <h2>Chat history</h2>
          <span className="text-sm text-muted">{total} messages logged</span>
        </div>
        <div className="page-header-actions">
          <Input
            placeholder="Search messages…"
            style={{ width: 260 }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<FaComments />} title="No messages found" description="Messages will appear here as users chat." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Content</th>
                    <th>Conversation</th>
                    <th>Model</th>
                    <th>Tokens</th>
                    <th>Feedback</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Badge variant={row.role === 'user' ? 'muted' : 'primary'}>
                          {row.role === 'user' ? 'User' : 'Assistant'}
                        </Badge>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <div className="ellipsis" title={row.content}>
                          {truncate(row.content || 'Not set', 110)}
                        </div>
                      </td>
                      <td className="text-sm text-secondary" style={{ maxWidth: 180 }}>
                        <div className="ellipsis">{row.conversationTitle || 'Not set'}</div>
                      </td>
                      <td className="text-sm text-secondary">{row.model || 'Not set'}</td>
                      <td className="text-sm text-secondary">{row.totalTokens ?? 'Not set'}</td>
                      <td>
                        {row.feedback ? (
                          <Badge variant={row.feedback.type === 'like' ? 'success' : 'danger'}>
                            {row.feedback.type === 'like' ? '👍 Like' : '👎 Dislike'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted">Not set</span>
                        )}
                      </td>
                      <td className="text-sm text-secondary">{formatDateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
              <Pagination page={page} total={total} limit={limit} onChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
