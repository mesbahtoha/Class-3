import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FaTerminal } from 'react-icons/fa';
import { apiGet, getErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Form';
import { formatDateTime, truncate } from '@/lib/format';
import type { LogRecord } from '@/types';

const LEVELS = ['error', 'warn', 'info', 'debug', 'http'];

export function AdminLogs() {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (level) params.set('level', level);
      const payload = await apiGet<{ items: LogRecord[]; total: number }>(
        `/api/v1/admin/logs?${params.toString()}`
      );
      setLogs(payload.items);
      setTotal(payload.total);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [page, level]);

  useEffect(() => {
    void load();
  }, [load]);

  const badgeFor = (lvl: string) => {
    if (lvl === 'error') return <Badge variant="danger">{lvl}</Badge>;
    if (lvl === 'warn') return <Badge variant="warning">{lvl}</Badge>;
    if (lvl === 'info') return <Badge variant="info">{lvl}</Badge>;
    return <Badge variant="muted">{lvl}</Badge>;
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <h2>System logs</h2>
          <span className="text-sm text-muted">{total} entries</span>
        </div>
        <div className="page-header-actions">
          <Select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} style={{ width: 140 }}>
            <option value="">All levels</option>
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{lvl}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <TableSkeleton rows={7} />
        ) : logs.length === 0 ? (
          <EmptyState icon={<FaTerminal />} title="No log entries" description="Logs will appear as the server processes requests." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Message</th>
                    <th>Details</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((logItem) => (
                    <tr key={logItem._id}>
                      <td>{badgeFor(logItem.level)}</td>
                      <td>
                        <div className="font-medium" style={{ fontSize: 13.5 }}>{truncate(logItem.message, 90)}</div>
                      </td>
                      <td className="text-sm text-muted" style={{ maxWidth: 240 }}>
                        {logItem.meta && Object.keys(logItem.meta).length > 0
                          ? <span title={JSON.stringify(logItem.meta)}>{truncate(JSON.stringify(logItem.meta), 60)}</span>
                          : 'Not set'}
                      </td>
                      <td className="text-sm text-secondary">{formatDateTime(logItem.timestamp)}</td>
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
