import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { SkeletonBox } from '@/components/ui/Skeleton';
import { getTeamAvatarUrl } from '@/lib/docs';
import {
  addDocTeamMember,
  deleteDocTeamMember,
  getAdminDocs,
  getErrorMessage,
  listAdminDocVersions,
  publishAdminDocs,
  restoreAdminDocVersion,
  saveAdminDocsDraft,
  setAdminDocsEnabled,
  setAdminDocsSchedule,
  unpublishAdminDocs,
  updateDocTeamMember,
} from '@/lib/docs';
import type { AdminDocs, DocsBlock, DocsChangelogEntry, DocsFeatureRow, DocsRoadmapEntry, DocsTeamMember, DocsVersionEntry } from '@/types';

type AdminDocsSnapshot = AdminDocs;

const TABS = ['Pitch deck', 'Product overview', 'Features', 'Team', 'Roadmap', 'Changelog', 'Versions', 'Publishing'] as const;
type DocsTab = (typeof TABS)[number];

export function DocsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminDocsSnapshot | null>(null);
  const [versions, setVersions] = useState<DocsVersionEntry[]>([]);
  const [pitchDeck, setPitchDeck] = useState<DocsBlock[]>([]);
  const [productOverview, setProductOverview] = useState<DocsBlock[]>([]);
  const [featureMatrix, setFeatureMatrix] = useState<DocsFeatureRow[]>([]);
  const [roadmap, setRoadmap] = useState<DocsRoadmapEntry[]>([]);
  const [teamMembers, setTeamMembers] = useState<DocsTeamMember[]>([]);
  const [changelog, setChangelog] = useState<DocsChangelogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DocsTab>('Pitch deck');
  const [teamForm, setTeamForm] = useState({ name: '', role: 'Member', contact: '' });
  const [teamAvatarFile, setTeamAvatarFile] = useState<File | null>(null);
  const [teamUploading, setTeamUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, versionsData] = await Promise.all([getAdminDocs(), listAdminDocVersions()]);
      const draft = data.doc;
      setPitchDeck(draft.pitchDeck ?? []);
      setProductOverview(draft.productOverview ?? []);
      setFeatureMatrix(draft.featureMatrix ?? []);
      setRoadmap(draft.roadmap ?? []);
      setTeamMembers(draft.teamMembers ?? []);
      setChangelog(draft.changelog ?? []);
      setVersions(versionsData.versions ?? []);
      setAdmin(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      await saveAdminDocsDraft({ pitchDeck, productOverview, featureMatrix, roadmap, changelog });
      toast.success('Draft saved.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishLoading(true);
    try {
      const data = await publishAdminDocs();
      toast.success(`Published version ${data.publishedVersion}.`);
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPublishLoading(false);
    }
  };

  const unpublish = async () => {
    setPublishLoading(true);
    try {
      await unpublishAdminDocs();
      toast.success('Documentation disabled. Public /docs now shows unavailable state.');
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPublishLoading(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    try {
      await setAdminDocsEnabled(enabled);
      toast.success(enabled ? 'Documentation enabled.' : 'Documentation disabled.');
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const restoreVersion = async (version: number) => {
    try {
      const { doc } = await restoreAdminDocVersion(version);
      toast.success(`Restored version ${version} to draft.`);
      setPitchDeck(doc.pitchDeck ?? []);
      setProductOverview(doc.productOverview ?? []);
      setFeatureMatrix(doc.featureMatrix ?? []);
      setRoadmap(doc.roadmap ?? []);
      setTeamMembers(doc.teamMembers ?? []);
      setChangelog(doc.changelog ?? []);
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const addTeam = async () => {
    if (!teamForm.name) {
      toast.error('Team member name is required.');
      return;
    }
    const form = new FormData();
    form.append('name', teamForm.name);
    form.append('role', teamForm.role);
    form.append('contact', teamForm.contact);
    if (teamAvatarFile) form.append('avatar', teamAvatarFile);
    setTeamUploading(true);
    try {
      const { member } = await addDocTeamMember(form);
      if (member) setTeamMembers((current) => [...current, member]);
      toast.success(`Team member added: ${member?.name ?? teamForm.name}.`);
      setTeamForm({ name: '', role: 'Member', contact: '' });
      setTeamAvatarFile(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setTeamUploading(false);
    }
  };

  const updateTeam = async (memberId: string, patch: { name?: string; role?: string; contact?: string; avatarId?: string }) => {
    try {
      await updateDocTeamMember(memberId, patch);
      setTeamMembers((current) => current.map((member) => (member.id === memberId ? { ...member, ...patch } : member)));
      toast.success('Team member updated.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const removeTeam = async (memberId: string, isConfirmed: boolean) => {
    if (isConfirmed) {
      toast.error('Confirmed team members cannot be removed.');
      return;
    }
    try {
      const { deleted } = await deleteDocTeamMember(memberId);
      if (deleted) setTeamMembers((current) => current.filter((member) => member.id !== memberId));
      toast.success('Team member removed.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1>Documentation CMS</h1>
        <p className="text-muted">Edit every documentation section, publish, schedule, manage the team and history.</p>
      </header>

      {error && (
        <div className="pg-card" style={{ padding: 16, background: 'var(--surface-warn)', marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="pg-card" style={{ padding: 16 }}>
          <SkeletonBox width="40%" height={20} style={{ marginBottom: 8 }} />
          <SkeletonBox width="70%" height={14} />
        </div>
      ) : !admin ? (
        <div className="pg-card" style={{ padding: 16 }}>No documentation data found.</div>
      ) : (
        <>
          <div className="docs-cms-toolbar">
            <div className="docs-cms-state">
              Published: <strong>{admin.publishedVersion ? `v${admin.publishedVersion}` : 'Not published yet'}</strong> · Draft v{admin.doc?.draftVersion} ·
              <span className="text-muted"> {admin.updatedBy ? `(by ${admin.updatedBy})` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => void saveDraft()} loading={saving}>Save draft</Button>
              <Button onClick={() => void publish()} loading={publishLoading}>Publish</Button>
              <Button variant="secondary" onClick={() => void unpublish()} loading={publishLoading}>Unpublish (disable)</Button>
              <Button variant="secondary" onClick={() => window.open('/docs', '_blank')}>Preview public page</Button>
            </div>
          </div>

          <div className="docs-cms-tabs" role="tablist" aria-label="Documentation editor tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className="docs-cms-tab"
                style={{
                  border: 'none',
                  background: activeTab === tab ? 'var(--text-primary)' : 'transparent',
                  color: activeTab === tab ? 'var(--bg-body)' : 'var(--text-secondary)',
                  fontWeight: 800,
                  borderRadius: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Pitch deck' && <BlockList title="Pitch deck" blocks={pitchDeck} onBlocks={setPitchDeck} />}
          {activeTab === 'Product overview' && <BlockList title="Product overview" blocks={productOverview} onBlocks={setProductOverview} />}
          {activeTab === 'Features' && <FeatureEditor features={featureMatrix} onFeatures={setFeatureMatrix} />}
          {activeTab === 'Team' && <TeamEditor members={teamMembers} form={teamForm} setForm={setTeamForm} setAvatarFile={setTeamAvatarFile} uploading={teamUploading} onAdd={() => void addTeam()} onUpdate={(id, patch) => void updateTeam(id, patch)} onRemove={(id, isConfirmed) => void removeTeam(id, isConfirmed)} />}
          {activeTab === 'Roadmap' && <RoadmapEditor entries={roadmap} onEntries={setRoadmap} />}
          {activeTab === 'Changelog' && <ChangelogEditor entries={changelog} onEntries={setChangelog} />}
          {activeTab === 'Versions' && (
            <div className="pg-card" style={{ padding: 16 }}>
              <h3>Version history</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                <thead>
                  <tr><th style={{ textAlign: 'left', padding: 6 }}>Version</th><th style={{ textAlign: 'left', padding: 6 }}>Published by</th><th style={{ textAlign: 'left', padding: 6 }}>Published at</th><th style={{ textAlign: 'left', padding: 6, width: 80 }}>Actions</th></tr>
                </thead>
                <tbody>
                  {versions.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 8, color: 'var(--text-secondary)' }}>No published versions yet.</td></tr>
                  ) : versions.map((version) => (
                    <tr key={version.version} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ padding: 6 }}>v{version.version}</td>
                      <td style={{ padding: 6 }}>{version.publishedBy || '—'}</td>
                      <td style={{ padding: 6 }}>{new Date(version.publishedAt).toLocaleString()}</td>
                      <td style={{ padding: 6 }}>
                        <Button size="sm" variant="secondary" onClick={() => void restoreVersion(version.version)}>Restore</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'Publishing' && (
            <div className="pg-card" style={{ padding: 16 }}>
              <h3>Publishing settings</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <Button variant="secondary" onClick={() => void setEnabled(true)}>Enable public docs</Button>
                <Button variant="danger" onClick={() => void setEnabled(false)}>Disable public docs</Button>
                <span className="text-muted">Status: {admin.doc?.settings?.enabled ? 'enabled' : 'disabled'}</span>
              </div>
              <ScheduleEditor settings={admin.doc?.settings ?? { enabled: true, start: null, end: null, timezone: 'Asia/Dhaka' }} onSave={async (schedule) => {
                try {
                  await setAdminDocsSchedule({
                    start: schedule.start ? new Date(schedule.start).toISOString() : null,
                    end: schedule.end ? new Date(schedule.end).toISOString() : null,
                    timezone: schedule.timezone,
                  });
                  toast.success('Schedule saved.');
                  await refresh();
                } catch (err) {
                  toast.error(getErrorMessage(err));
                }
              }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Editors ---------------- */

interface BlockListProps {
  title: string;
  blocks: DocsBlock[];
  onBlocks: (blocks: DocsBlock[]) => void;
}

function BlockList({ title, blocks, onBlocks }: BlockListProps) {
  const updateBlock = (index: number, patch: Partial<DocsBlock>) => {
    onBlocks(blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  };
  const updateParagraph = (blockIndex: number, lineIndex: number, text: string) => {
    onBlocks(blocks.map((block, i) => {
      if (i !== blockIndex) return block;
      const body = [...block.body];
      body[lineIndex] = text;
      return { ...block, body };
    }));
  };
  return (
    <div className="pg-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <Button variant="secondary" onClick={() => onBlocks([...blocks, { id: `block-${Date.now()}-${blocks.length + 1}`, heading: 'New section', body: [''] }])}>Add block</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {blocks.map((block, blockIndex) => (
          <div key={block.id} className="pg-card" style={{ padding: 14, background: 'var(--bg-surface-2)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <Input value={block.heading} placeholder="Heading" style={{ fontWeight: 800 }} onChange={(e) => updateBlock(blockIndex, { heading: e.target.value })} />
              <Button variant="danger" onClick={() => onBlocks(blocks.filter((_, i) => i !== blockIndex))}>Remove block</Button>
            </div>
            {block.body.map((line, lineIndex) => (
              <Input
                key={`${blockIndex}-${lineIndex}`}
                value={line}
                placeholder={`Paragraph ${lineIndex + 1}`}
                onChange={(e) => updateParagraph(blockIndex, lineIndex, e.target.value)}
                style={{ marginBottom: 4 }}
              />
            ))}
            <Button variant="secondary" size="sm" onClick={() => updateBlock(blockIndex, { body: [...block.body, ''] })}>Add paragraph</Button>
          </div>
        ))}
        {blocks.length === 0 && <p className="text-muted">No blocks yet.</p>}
      </div>
    </div>
  );
}

interface FeatureEditorProps { features: DocsFeatureRow[]; onFeatures: (features: DocsFeatureRow[]) => void; }

function FeatureEditor({ features, onFeatures }: FeatureEditorProps) {
  const update = (index: number, patch: Partial<DocsFeatureRow>) => onFeatures(features.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="pg-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Feature matrix</h3>
        <Button variant="secondary" onClick={() => onFeatures([...features, { name: 'New feature', description: '', status: 'planned' }])}>Add feature</Button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr><th style={{ textAlign: 'left', padding: 6 }}>Name</th><th style={{ textAlign: 'left', padding: 6 }}>Status</th><th style={{ textAlign: 'left', padding: 6 }}>Description</th><th style={{ textAlign: 'left', padding: 6, width: 100 }}>Actions</th></tr>
        </thead>
        <tbody>
          {features.map((row, index) => (
            <tr key={`${row.name}-${index}`} style={{ borderTop: '1px solid var(--border-color)' }}>
              <td style={{ padding: 6 }}><Input value={row.name} onChange={(e) => update(index, { name: e.target.value })} /></td>
              <td style={{ padding: 6 }}>
                <select value={row.status} onChange={(e) => update(index, { status: e.target.value as DocsFeatureRow['status'] })} className="select" aria-label={`Status of ${row.name}`}>
                  <option value="completed">completed</option>
                  <option value="in_progress">in_progress</option>
                  <option value="planned">planned</option>
                </select>
              </td>
              <td style={{ padding: 6 }}><Input value={row.description} placeholder="Description" onChange={(e) => update(index, { description: e.target.value })} /></td>
              <td style={{ padding: 6, width: 90 }}><Button size="sm" variant="danger" onClick={() => onFeatures(features.filter((_, i) => i !== index))}>Remove</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TeamEditorProps {
  members: DocsTeamMember[];
  form: { name: string; role: string; contact: string };
  setForm: (form: { name: string; role: string; contact: string }) => void;
  setAvatarFile: (file: File | null) => void;
  uploading: boolean;
  onAdd: () => void;
  onUpdate: (id: string, patch: { name?: string; role?: string; contact?: string; avatarId?: string }) => void;
  onRemove: (id: string, isConfirmed: boolean) => void;
}

function TeamEditor({ members, form, setForm, setAvatarFile, uploading, onAdd, onUpdate, onRemove }: TeamEditorProps) {
  return (
    <div className="pg-card" style={{ padding: 16 }}>
      <h3 style={{ margin: 0 }}>Team Infyners</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', margin: '12px 0' }}>
        <Input value={form.name} placeholder="Full name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input value={form.role} placeholder="Role" onChange={(e) => setForm({ ...form, role: e.target.value })} />
        <Input value={form.contact} placeholder="Contact (e.g. +880 1601860526)" onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        <Input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} className="docs-file-input" aria-label="Team avatar" />
        <Button variant="secondary" onClick={onAdd} loading={uploading}>Add member</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map((member) => (
          <div key={member.id} className="pg-card" style={{ padding: 12, background: 'var(--bg-surface-2)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {member.avatarId ? <img className="docs-team-avatar" src={getTeamAvatarUrl(member.id)} alt={member.name} /> : <div className="docs-team-avatar-fallback">{member.name.slice(0, 2).toUpperCase()}</div>}
              <div style={{ flex: 1 }}>
                <strong>{member.name}</strong>
                <div className="text-muted" style={{ fontSize: 13 }}>{member.role} — {member.contact}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onUpdate(member.id, { name: member.name, role: member.role, contact: member.contact })}>Update</Button>
              <Button size="sm" variant="danger" disabled={member.isConfirmed === true} onClick={() => onRemove(member.id, Boolean(member.isConfirmed))}>{member.isConfirmed ? 'Protected' : 'Remove'}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RoadmapEditorProps { entries: DocsRoadmapEntry[]; onEntries: (entries: DocsRoadmapEntry[]) => void; }

function RoadmapEditor({ entries, onEntries }: RoadmapEditorProps) {
  const update = (index: number, patch: Partial<DocsRoadmapEntry>) => onEntries(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  return (
    <div className="pg-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Roadmap</h3>
        <Button variant="secondary" onClick={() => onEntries([...entries, { category: 'shortTerm', item: 'New roadmap item', description: '' }])}>Add entry</Button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr><th style={{ textAlign: 'left', padding: 6 }}>Category</th><th style={{ textAlign: 'left', padding: 6 }}>Item</th><th style={{ textAlign: 'left', padding: 6 }}>Description</th><th style={{ textAlign: 'left', padding: 6, width: 80 }}>Actions</th></tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.category}-${index}`} style={{ borderTop: '1px solid var(--border-color)' }}>
              <td style={{ padding: 6 }}>
                <select value={entry.category} onChange={(e) => update(index, { category: e.target.value as DocsRoadmapEntry['category'] })} className="select" aria-label={`Category of ${entry.item}`}>
                  <option value="shortTerm">shortTerm</option>
                  <option value="midTerm">midTerm</option>
                  <option value="longTerm">longTerm</option>
                </select>
              </td>
              <td style={{ padding: 6 }}><Input value={entry.item} onChange={(e) => update(index, { item: e.target.value })} /></td>
              <td style={{ padding: 6 }}><Input value={entry.description} onChange={(e) => update(index, { description: e.target.value })} /></td>
              <td style={{ padding: 6, width: 90 }}><Button size="sm" variant="danger" onClick={() => onEntries(entries.filter((_, i) => i !== index))}>Remove</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ChangelogEditorProps { entries: DocsChangelogEntry[]; onEntries: (entries: DocsChangelogEntry[]) => void; }

function ChangelogEditor({ entries, onEntries }: ChangelogEditorProps) {
  const updateEntry = (index: number, patch: Partial<DocsChangelogEntry>) => {
    onEntries(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };
  return (
    <div className="pg-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Changelog</h3>
        <Button variant="secondary" onClick={() => onEntries([...entries, { version: '1.0.0', date: '2026-11-20', title: 'New version', items: ['First entry.'] }])}>Add entry</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {entries.map((entry, index) => (
          <div key={`entry-${index}`} className="pg-card" style={{ padding: 12, background: 'var(--bg-surface-2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input style={{ width: 96, fontWeight: 800 }} value={entry.version} placeholder="Version" onChange={(e) => updateEntry(index, { version: e.target.value })} />
              <Input style={{ width: 120 }} type="date" value={entry.date} onChange={(e) => updateEntry(index, { date: e.target.value })} />
              <Input style={{ flex: 1, minWidth: 200 }} value={entry.title} placeholder="Title" onChange={(e) => updateEntry(index, { title: e.target.value })} />
              <Button variant="danger" onClick={() => onEntries(entries.filter((_, i) => i !== index))}>Remove</Button>
            </div>
            {entry.items.map((item, itemIndex) => (
              <Input
                key={itemIndex}
                value={item}
                placeholder={`Change ${itemIndex + 1}`}
                onChange={(e) => updateEntry(index, { items: entry.items.map((current, i) => (i === itemIndex ? e.target.value : current)) })}
                style={{ marginTop: 4 }}
              />
            ))}
            <Button variant="secondary" size="sm" style={{ marginTop: 4 }} onClick={() => updateEntry(index, { items: [...entry.items, ''] })}>Add change</Button>
          </div>
        ))}
        {entries.length === 0 && <p className="text-muted">No changelog entries yet.</p>}
      </div>
    </div>
  );
}

interface ScheduleEditorProps {
  settings: { start: string | null; end: string | null; timezone: string };
  onSave: (schedule: { start: string | null; end: string | null; timezone: string }) => void;
}

function ScheduleEditor({ settings, onSave }: ScheduleEditorProps) {
  const [form, setForm] = useState({ start: settings.start ?? '', end: settings.end ?? '', timezone: settings.timezone });
  useEffect(() => {
    setForm({ start: settings.start ?? '', end: settings.end ?? '', timezone: settings.timezone });
  }, [settings]);
  const invalid = form.start && form.end && form.start > form.end;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 4 }}>
      <Input style={{ width: 200 }} type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
      <Input style={{ width: 200 }} type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
      <Input style={{ width: 180 }} value={form.timezone} placeholder="IANA timezone (e.g. Asia/Dhaka)" onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
      <Button variant="secondary" onClick={() => onSave(form)} disabled={Boolean(invalid)}>Save schedule</Button>
      <span className="text-muted">Empty start/end = always accessible. Timezone controls window comparisons.</span>
    </div>
  );
}

export default DocsAdminPage;
