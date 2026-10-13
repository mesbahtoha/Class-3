import { useEffect, useState } from 'react';
import { FaChartBar } from 'react-icons/fa';
import { MdCheckCircle, MdErrorOutline } from 'react-icons/md';
import { apiGet } from '@/lib/api';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { StatGridSkeleton } from '@/components/ui/Skeleton';
import { formatTokens } from '@/lib/format';

interface UsageSummary {
  totalTokens: number;
  requests: number;
  averageTokens: number;
  totalCost?: number;
}

interface TokenData {
  today: UsageSummary;
  month: UsageSummary;
  allTime: UsageSummary;
  topModels: { model: string; totalTokens: number; requests: number }[];
  perRequestAverageTokens: number;
  apiKeyConfigured: boolean;
  accounts: { users: number; admins: number };
}

export function AdminTokens() {
  const [data, setData] = useState<TokenData | null>(null);

  useEffect(() => {
    apiGet<{ tokens: TokenData }>('/api/v1/admin/tokens/usage')
      .then((payload) => setData(payload.tokens))
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div>
        <div className="page-header">
          <div className="page-header-title">
            <h2>Token usage</h2>
            <p className="text-sm text-muted" style={{ marginTop: 0 }}>
              OpenAI-compatible tokens consumed by the AI assistant
            </p>
          </div>
        </div>
        <StatGridSkeleton cards={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <h2>Token usage</h2>
          <p className="text-sm text-muted" style={{ marginTop: 0 }}>
            OpenAI-compatible tokens consumed by the AI assistant
          </p>
        </div>
        <div className="page-header-actions">
          {data.apiKeyConfigured ? (
            <Badge variant="success"><MdCheckCircle /> API key configured</Badge>
          ) : (
            <Badge variant="danger"><MdErrorOutline /> No API key set</Badge>
          )}
          <Badge variant="muted">{data.accounts.users} users · {data.accounts.admins} admins</Badge>
        </div>
      </div>

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard label="Tokens today" value={formatTokens(data.today.totalTokens)} icon={<FaChartBar />} hint={`${data.today.requests} requests`} />
        <StatCard label="Tokens this month" value={formatTokens(data.month.totalTokens)} accent="success" hint={`${data.month.requests} requests`} />
        <StatCard label="Tokens all time" value={formatTokens(data.allTime.totalTokens)} accent="warning" hint={`${data.allTime.requests} requests`} />
        <StatCard label="Avg tokens / request" value={formatTokens(data.perRequestAverageTokens)} />
      </div>

      {data.topModels.length > 0 && (
        <div className="card mt-6">
          <div className="card-header"><span className="font-semibold">Usage by model (last 30 days)</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Tokens</th>
                  <th>Requests</th>
                  <th>Avg tokens/request</th>
                </tr>
              </thead>
              <tbody>
                {data.topModels.map((model) => (
                  <tr key={model.model}>
                    <td className="font-medium">{model.model}</td>
                    <td>{formatTokens(model.totalTokens)}</td>
                    <td>{model.requests}</td>
                    <td>{model.requests ? formatTokens(Math.round(model.totalTokens / model.requests)) : 'Not set'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
