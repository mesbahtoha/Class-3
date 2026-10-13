import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { adminGetProviders, adminUpdateProviders, adminValidateProvider, type ProviderSettings } from '@/lib/tutor';
import { getErrorMessage, isRouteNotFoundError } from '@/lib/api';
import { StaleBackendNotice } from '@/components/ui/StaleBackendNotice';

export function AdminAISettings() {
  const [data, setData] = useState<ProviderSettings | null>(null);
  const [staleBackend, setStaleBackend] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(700);
  const [timeoutMs, setTimeoutMs] = useState(45000);
  const [keys, setKeys] = useState({ anthropicApiKey: '', geminiApiKey: '', openRouterApiKey: '', compatibleBaseUrl: '', compatibleApiKey: '', compatibleModel: '' });
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState('');

  const refresh = async () => {
    setStaleBackend(false);
    setLoadError('');
    try {
      const d = await adminGetProviders();
      setData(d);
      setProvider(d.active.provider);
      setModel(d.active.model);
      setTemperature(d.active.temperature);
      setMaxTokens(d.active.maxTokens);
      setTimeoutMs(d.active.timeoutMs);
    } catch (e) {
      if (isRouteNotFoundError(e)) {
        setStaleBackend(true);
      } else {
        setLoadError(getErrorMessage(e));
        toast.error(getErrorMessage(e));
      }
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = data?.providers.find((p) => p.id === provider);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { provider, model, temperature, maxTokens, timeoutMs };
      for (const [k, v] of Object.entries(keys)) {
        if (v) body[k] = v; // write-only; empty = keep existing
      }
      await adminUpdateProviders(body);
      toast.success('সংরক্ষণ হয়েছে');
      setKeys({ anthropicApiKey: '', geminiApiKey: '', openRouterApiKey: '', compatibleBaseUrl: '', compatibleApiKey: '', compatibleModel: '' });
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const validate = async (id: string) => {
    setValidating(id);
    try {
      const r = await adminValidateProvider(id);
      toast[r.ok ? 'success' : 'error'](r.ok ? `${id}: সংযোগ ঠিক আছে (${r.latencyMs}ms)` : `${id}: সংযোগ ব্যর্থ`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setValidating('');
    }
  };

  if (!data)
    return (
      <div style={{ padding: 20, maxWidth: 860 }}>
        {staleBackend ? (
          <StaleBackendNotice feature="AI প্রোভাইডার সেটিংস" onRetry={() => void refresh()} />
        ) : loadError ? (
          <div className="card" style={{ padding: 20, textAlign: 'center' }}>
            <p>⚠️ {loadError}</p>
            <div style={{ marginTop: 12 }}>
              <Button size="sm" variant="secondary" onClick={() => void refresh()}>আবার চেষ্টা করো</Button>
            </div>
          </div>
        ) : (
          <p className="text-muted">লোড হচ্ছে…</p>
        )}
      </div>
    );

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>🤖 AI প্রোভাইডার সেটিংস</h1>
      <p className="text-muted" style={{ marginBottom: 16 }}>সক্রিয় প্রোভাইডার/মডেল বাছো। কী কখনো দেখানো হয় না। শুধু মুখোশ পরা অবস্থা দেখা যায়।</p>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div className="font-bold" style={{ marginBottom: 8 }}>সক্রিয় মডেল</div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          <select className="select" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); }} aria-label="প্রোভাইডার">
            {data.providers.filter((p) => p.id !== 'mock').map((p) => (
              <option key={p.id} value={p.id}>{p.displayName}{p.implemented ? '' : ' (শীঘ্রই)'}</option>
            ))}
          </select>
          <select className="select" value={model} onChange={(e) => setModel(e.target.value)} aria-label="মডেল" style={{ minWidth: 280 }}>
            <option value="">মডেল বাছো…</option>
            {(selected?.models ?? []).map((m) => (
              <option key={m.modelId} value={m.modelId}>{m.label}</option>
            ))}
          </select>
        </div>
        {selected && (
          <div className="flex gap-2 text-xs" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <Badge variant={selected.capabilities?.streaming ? 'success' : 'muted'}>streaming: {selected.capabilities?.streaming ? 'হ্যাঁ' : 'না'}</Badge>
            <Badge variant={selected.capabilities?.vision ? 'success' : 'muted'}>vision: {selected.capabilities?.vision ? 'হ্যাঁ' : 'না'}</Badge>
            <Badge variant={selected.capabilities?.structuredOutput ? 'success' : 'muted'}>structured: {selected.capabilities?.structuredOutput ? 'হ্যাঁ' : 'না'}</Badge>
          </div>
        )}
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <label className="text-xs">Temperature
            <Input type="number" step="0.05" min={0} max={1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
          </label>
          <label className="text-xs">Max tokens
            <Input type="number" min={64} max={4000} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
          </label>
          <label className="text-xs">Timeout (ms)
            <Input type="number" min={5000} max={120000} step={1000} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} />
          </label>
        </div>
        <div className="font-bold" style={{ margin: '12px 0 8px' }}>কী (শুধু লিখন। খালি রাখলে আগেরটাই থাকবে)</div>
        <div className="flex flex-col" style={{ gap: 8, maxWidth: 520 }}>
          <Input type="password" placeholder="OpenRouter API key (aloch…)" value={keys.openRouterApiKey} onChange={(e) => setKeys({ ...keys, openRouterApiKey: e.target.value })} autoComplete="off" />
          <Input type="password" placeholder="Anthropic API key" value={keys.anthropicApiKey} onChange={(e) => setKeys({ ...keys, anthropicApiKey: e.target.value })} autoComplete="off" />
          <Input type="password" placeholder="Gemini API key" value={keys.geminiApiKey} onChange={(e) => setKeys({ ...keys, geminiApiKey: e.target.value })} autoComplete="off" />
          <Input placeholder="Compatible base URL (https://…)" value={keys.compatibleBaseUrl} onChange={(e) => setKeys({ ...keys, compatibleBaseUrl: e.target.value })} autoComplete="off" />
          <div className="flex gap-2">
            <Input type="password" placeholder="Compatible API key" value={keys.compatibleApiKey} onChange={(e) => setKeys({ ...keys, compatibleApiKey: e.target.value })} autoComplete="off" />
            <Input placeholder="Compatible model" value={keys.compatibleModel} onChange={(e) => setKeys({ ...keys, compatibleModel: e.target.value })} autoComplete="off" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => void save()} disabled={busy || !model}>{busy ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করো'}</Button>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="font-bold" style={{ marginBottom: 8 }}>প্রোভাইডার অবস্থা</div>
        {data.providers.filter((p) => p.id !== 'mock').map((p) => (
          <div key={p.id} className="flex items-center justify-between" style={{ padding: '8px 0', borderTop: '1px solid var(--border-color)', gap: 8 }}>
            <div>
              <div className="font-semibold">{p.displayName}</div>
              <div className="text-xs text-muted">
                কী: {data.credentials[p.id]?.configured ? `সেট আছে (${data.credentials[p.id]?.masked})` : 'সেট নেই'}
                {data.credentials[p.id]?.source ? ` • উৎস: ${data.credentials[p.id]?.source}` : ''}
              </div>
            </div>
            <Button size="sm" variant="secondary" disabled={!!validating} onClick={() => void validate(p.id)}>
              {validating === p.id ? '…' : 'যাচাই করো'}
            </Button>
          </div>
        ))}
        <p className="text-xs text-muted" style={{ marginTop: 8 }}>
          ফলব্যাক: recoverable ব্যর্থতায় (timeout/rate-limit/quota/outage) অনুমোদিত তালিকা থেকে চেষ্টা হবে। ভুল উত্তরের অনুমানে মডেল বদলানো হয় না।
        </p>
      </div>
    </div>
  );
}
