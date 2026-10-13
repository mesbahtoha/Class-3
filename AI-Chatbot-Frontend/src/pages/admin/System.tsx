import { useEffect, useState } from 'react';
import { FaDatabase, FaMemory, FaMicrochip, FaServer } from 'react-icons/fa';
import { apiGet } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { StatGridSkeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { formatDuration } from '@/lib/format';

interface SystemData {
  uptime: number;
  nodeVersion: string;
  platform: string;
  cpus: number;
  loadAverage: number[];
  totalMemoryMb: number;
  freeMemoryMb: number;
  processMemory: { rssMb: number; heapTotalMb: number; heapUsedMb: number };
  mongodb: { status: string; version: string | null; dbSizeMb: number; collections: number };
  env: string;
  appBaseUrl: string;
  model: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between" style={{ padding: '9px 0', borderBottom: '1px solid var(--border-color)' }}>
      <span className="text-sm text-secondary">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function AdminSystem() {
  const [data, setData] = useState<SystemData | null>(null);

  useEffect(() => {
    apiGet<{ system: SystemData }>('/api/v1/admin/system')
      .then((payload) => setData(payload.system))
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div>
        <div className="page-header">
          <div className="page-header-title">
            <h2>System information</h2>
            <p className="text-sm text-muted" style={{ marginTop: 0 }}>
              Live status of the backend server
            </p>
          </div>
        </div>
        <StatGridSkeleton cards={4} />
      </div>
    );
  }

  const memoryPct = data.totalMemoryMb
    ? Math.round(((data.totalMemoryMb - data.freeMemoryMb) / data.totalMemoryMb) * 100)
    : 0;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-title">
          <h2>System information</h2>
          <p className="text-sm text-muted" style={{ marginTop: 0 }}>
            Live status of the backend server
          </p>
        </div>
      </div>

      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 8 }}>
        <StatCard
          label="Uptime"
          value={formatDuration(data.uptime)}
          icon={<FaServer />}
          hint={`Node ${data.nodeVersion}`}
        />
        <StatCard
          label="CPU cores"
          value={data.cpus}
          icon={<FaMicrochip />}
          hint={data.loadAverage?.length ? `load ${data.loadAverage.map((n) => n.toFixed(2)).join(' / ')}` : undefined}
        />
        <StatCard
          label="Memory (server)"
          value={`${data.freeMemoryMb} MB free`}
          icon={<FaMemory />}
          accent="warning"
          hint={`${memoryPct}% used of ${data.totalMemoryMb} MB`}
        />
        <StatCard
          label="Process memory"
          value={`${data.processMemory.heapUsedMb} MB`}
          icon={<FaMemory />}
          accent="info"
          hint={`heap ${data.processMemory.heapTotalMb} MB · rss ${data.processMemory.rssMb} MB`}
        />
      </div>

      <div className="card mt-6" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="font-semibold">Server details</span>
          <Badge variant="success">● running</Badge>
        </div>
        <div style={{ padding: '6px 20px 16px' }}>
          <Row label="Environment" value={data.env} />
          <Row label="Platform" value={data.platform} />
          <Row label="App base URL" value={<a href={data.appBaseUrl} target="_blank" rel="noreferrer">{data.appBaseUrl}</a>} />
          <Row label="AI model" value={data.model || 'Not set'} />
        </div>
      </div>

      <div className="card mt-4" style={{ maxWidth: 640 }}>
        <div className="card-header">
          <span className="font-semibold flex items-center gap-2"><FaDatabase /> MongoDB</span>
          <Badge variant={data.mongodb.status === 'connected' ? 'success' : 'danger'}>
            {data.mongodb.status}
          </Badge>
        </div>
        <div style={{ padding: '6px 20px 16px' }}>
          <Row label="Version" value={data.mongodb.version ?? 'Not set'} />
          <Row label="Database size" value={`${data.mongodb.dbSizeMb} MB`} />
          <Row label="Collections" value={data.mongodb.collections} />
        </div>
      </div>
    </div>
  );
}
