import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FaSave, FaKey } from 'react-icons/fa';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { Toggle } from '@/components/ui/Toggle';
import type { SettingsEntry } from '@/types';

interface ApiKeyStatus {
  configured: boolean;
  masked: string | null;
  source: string;
}

const GROUP_LABELS: Record<string, string> = {
  app: 'Application',
  ai: 'AI & Quotas',
  ui: 'Interface',
  general: 'General',
};

function Editor({
  entry,
  value,
  onChange,
}: {
  entry: SettingsEntry;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const key = entry.key;
  const current = value;

  if (typeof current === 'boolean' || current === 'true' || current === 'false') {
    const bool = current === true || current === 'true';
    return <Toggle checked={bool} onChange={(v) => onChange(v)} label={bool ? 'Enabled' : 'Disabled'} />;
  }

  if (typeof current === 'number' || (typeof current === 'string' && current !== '' && !Number.isNaN(Number(current)) && !/[a-z]/i.test(String(current).replace('.', '')))) {
    const isNumber = typeof current === 'number';
    if (key === 'ai.temperature') {
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isNumber ? current : Number(current)}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span className="text-sm text-secondary" style={{ width: 40, textAlign: 'right' }}>{current}</span>
        </div>
      );
    }
    return (
      <Input
        type="number"
        value={isNumber ? current : Number(current)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }

  if (key === 'ai.model' || key === 'ai.modelFast' || key === 'ai.modelAccurate') {
    return (
      <Select value={String(current)} onChange={(e) => onChange(e.target.value)}>
        <option value="google/gemini-2.5-flash-lite">google/gemini-2.5-flash-lite</option>
        <option value="google/gemini-2.5-flash">google/gemini-2.5-flash</option>
        <option value="google/gemini-2.5-pro">google/gemini-2.5-pro</option>
        <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
        <option value="openai/gpt-4o">openai/gpt-4o</option>
        <option value="anthropic/claude-3-5-sonnet">anthropic/claude-3-5-sonnet</option>
        <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct</option>
        <option value="deepseek/deepseek-chat">deepseek/deepseek-chat</option>
        <option value="deepseek/deepseek-reasoner">deepseek/deepseek-reasoner</option>
      </Select>
    );
  }

  if (key === 'ai.systemPrompt' || key === 'ai.openRouterApiKey') {
    return (
      <Textarea
        value={String(current)}
        onChange={(e) => onChange(e.target.value)}
        rows={key === 'ai.openRouterApiKey' ? 1 : 4}
        placeholder={key === 'ai.openRouterApiKey' ? 'sk-or-v1-…' : 'System prompt for the assistant'}
      />
    );
  }

  return (
    <Input value={String(current)} onChange={(e) => onChange(e.target.value)} />
  );
}

export function AdminSettings() {
  const [entries, setEntries] = useState<SettingsEntry[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState<ApiKeyStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await apiGet<{ settings: SettingsEntry[] }>('/api/v1/admin/settings');
      const list = payload.settings ?? [];
      setEntries(list);
      const next: Record<string, unknown> = {};
      for (const entry of list) next[entry.key] = entry.value;
      setDraft(next);
      const keyPayload = await apiGet<ApiKeyStatus>('/api/v1/admin/settings/api-key');
      setApiKey(keyPayload);
    } catch {
      toast.error('Could not load settings');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = entries.reduce<Record<string, SettingsEntry[]>>((acc, entry) => {
    const group = entry.group || 'general';
    acc[group] = acc[group] ?? [];
    acc[group].push(entry);
    return acc;
  }, {});

  const save = async () => {
    setSaving(true);
    try {
      const entriesToSave = Object.entries(draft).map(([key, value]) => ({ key, value }));
      const payload = await apiPut<{ settings: SettingsEntry[] }>('/api/v1/admin/settings', {
        entries: entriesToSave,
      });
      const list = payload.settings ?? [];
      const next: Record<string, unknown> = {};
      for (const entry of list) next[entry.key] = entry.value;
      setEntries(list);
      setDraft(next);
      toast.success('Settings saved');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!entries.length) {
    return (
      <div style={{ maxWidth: 760 }}>
        <div className="page-header">
          <div className="page-header-title">
            <h2>Settings</h2>
            <span className="text-sm text-muted">Appearance, AI model, quotas and more</span>
          </div>
        </div>
        <div className="card">
          <TableSkeleton rows={5} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, width: '100%' }}>
      <div className="page-header">
        <div className="page-header-title">
          <h2>Settings</h2>
          <span className="text-sm text-muted">Appearance, AI model, quotas and more</span>
        </div>
        <div className="page-header-actions">
          <Button onClick={() => void save()} loading={saving}>
            <FaSave /> Save changes
          </Button>
        </div>
      </div>

      <div className="card mb-4" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <FaKey style={{ color: 'var(--color-primary)' }} />
        <div className="flex-1">
          <div className="font-semibold text-sm">OpenRouter API key</div>
          <div className="text-xs text-muted">
            {apiKey?.configured
              ? `Configured (${apiKey.masked ?? 'masked'}) · source: ${apiKey.source}`
              : 'Not configured. AI responses will fail. Set it in the backend .env or use the AI settings above.'}
          </div>
        </div>
        <Badge variant={apiKey?.configured ? 'success' : 'danger'}>
          {apiKey?.configured ? 'Active' : 'Missing'}
        </Badge>
      </div>

      {Object.entries(groups).map(([group, groupEntries]) => (
        <div key={group} className="card mb-4">
          <div className="card-header">
            <span className="font-semibold">{GROUP_LABELS[group] ?? group}</span>
          </div>
          <div className="card-body flex flex-col" style={{ gap: 18 }}>
            {groupEntries.map((entry) => (
              <div key={entry.key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="field-label" style={{ fontSize: 13.5 }}>{entry.key}</label>
                  {entry.description && <span className="text-xs text-muted">{entry.description}</span>}
                </div>
                <Editor
                  entry={entry}
                  value={draft[entry.key]}
                  onChange={(value) => setDraft((prev) => ({ ...prev, [entry.key]: value }))}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="text-right">
        <Button onClick={() => void save()} loading={saving}>
          <FaSave /> Save changes
        </Button>
      </div>
    </div>
  );
}
