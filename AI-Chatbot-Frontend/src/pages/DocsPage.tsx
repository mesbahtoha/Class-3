import { useEffect, useState, type ComponentType } from 'react';
import { MdContentPasteSearch, MdFactCheck, MdLibraryBooks, MdApi, MdStorage, MdSettingsRemote, MdGroup, MdSummarize, MdSecurity, MdTimeline, MdHistory, MdTableChart, MdArrowForward, MdAccountCircle } from 'react-icons/md';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonBox } from '@/components/ui/Skeleton';
import { ArchitectureDiagram, AiDataFlowDiagram, PitchDeckBlock } from '@/components/docs/Diagram';
import { getTeamAvatarUrl, getDocsContent, getDocsMeta, getDocsStats } from '@/lib/docs';
import type { DocsBlock, DocsContent, DocsFeatureRow, PublicDocStats } from '@/types';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function blocksText(blocks: DocsBlock[]): string {
  return blocks.map((block) => `${block.heading} ${block.body.join(' ')}`).join(' ');
}

interface SectionDef {
  id: string;
  label: string;
  text: string;
  icon: ComponentType;
}

const SECTION_DEFS: SectionDef[] = [
  { id: 'pitch-deck', label: 'Pitch deck', text: 'Problem, Solution, Market Opportunity, Competition, Business Model, Traction, Team and Vision.', icon: MdTimeline },
  { id: 'product-overview', label: 'Product overview', text: 'What Shikhi Bondju does, target users, how students interact with the AI Tutor, textbooks, practice and exams, and administrator usage.', icon: MdSummarize },
  { id: 'feature-matrix', label: 'Feature matrix', text: 'Completed, in-progress and planned features with routes.', icon: MdTableChart },
  { id: 'architecture', label: 'System architecture', text: 'Frontend, backend, services, database, AI providers and security.', icon: MdSettingsRemote },
  { id: 'ai-data-flow', label: 'AI data flow', text: 'Language detection, textbook retrieval, context construction, provider routing, generation, citation validation.', icon: MdAccountCircle },
  { id: 'technology-stack', label: 'Technology stack', text: 'Frontend framework, backend framework, database, languages, security and AI integrations.', icon: MdLibraryBooks },
  { id: 'api-reference', label: 'API documentation', text: 'Authentication, users, conversations, tutoring, practice, books, admin and documentation endpoints.', icon: MdApi },
  { id: 'data-layer', label: 'Data layer', text: 'MongoDB collections, textbook ingestion, student conversations and examination records.', icon: MdStorage },
  { id: 'ai-layer', label: 'AI layer', text: 'AI providers, provider routing, modes, prompt engineering, retrieval and safety.', icon: MdSecurity },
  { id: 'roadmap', label: 'Roadmap', text: 'Short term, mid term and long term plans.', icon: MdArrowForward },
  { id: 'team', label: 'Team Infyners', text: 'Team Lead and members with contacts.', icon: MdGroup },
  { id: 'live-statistics', label: 'Live statistics', text: 'Real aggregate counts of registered users, conversations, books, practice exams and AI usage.', icon: MdFactCheck },
  { id: 'changelog', label: 'Changelog', text: 'Version history with changes, feature additions and improvements.', icon: MdHistory },
];

const TECH_STACK = [
  {
    title: 'Frontend',
    items: [
      ['React 18', 'Component-based UI library (class components replaced with hooks)'],
      ['Vite 5', 'Build tool with instant dev server and code-splitting'],
      ['TypeScript ~5.6', 'Strict typing for all frontend code'],
      ['React Router 6', 'Client-side routing (lazy-loaded route pages)'],
      ['Axios', 'HTTP client for REST API calls'],
    ],
  },
  {
    title: 'Backend',
    items: [
      ['Node.js', 'JavaScript runtime for the API server'],
      ['Express 4', 'HTTP framework with composable middleware'],
      ['Mongoose 8', 'MongoDB object-document modeling'],
      ['Zod 3', 'Runtime schema validation for API inputs'],
    ],
  },
  {
    title: 'Data & Security',
    items: [
      ['MongoDB', 'Document database (MongoDB Atlas)'],
      ['GridFS', 'Binary storage (PDFs, images, avatars)'],
      ['Helmet + CORS', 'Security headers and origin control'],
      ['express-rate-limit', 'Global + auth + AI rate limiting'],
      ['express-mongo-sanitize', 'Database query sanitization'],
    ],
  },
  {
    title: 'AI & AI integrations',
    items: [
      ['OpenRouter', 'AI gateway used by the AI Tutor (vision route for OCR)'],
      ['Gemini 2.5 Flash Lite', 'Default chat model (fast/balanced/accurate modes)'],
      ['Vision model routing', 'Multimodal calls for image/OCR processing'],
    ],
  },
  {
    title: 'PDF processing',
    items: [
      ['pdf-parse', 'Text extraction from PDFs (text books + notices)'],
      ['OCR (vision model)', 'Scanned PDF transcription via the configured vision model'],
      ['Text chunking', 'Real page-numbered chunks for retrieval'],
    ],
  },
];

const API_ROWS: Array<{ method: string; path: string; auth: string; purpose: string; notes?: string }> = [
  { method: 'POST', path: '/api/v1/auth/register', auth: 'Public', purpose: 'Create a student account.' },
  { method: 'POST', path: '/api/v1/auth/login', auth: 'Public (auth-limited)', purpose: 'Log in and receive a token.', notes: 'Rate limited by authLimiter.' },
  { method: 'POST', path: '/api/v1/auth/login/admin', auth: 'Public (auth-limited)', purpose: 'Admin login.' },
  { method: 'POST', path: '/api/v1/auth/refresh', auth: 'Public (auth-limited)', purpose: 'Refresh access token.' },
  { method: 'POST', path: '/api/v1/auth/logout', auth: 'Authenticated', purpose: 'Log out the current session.' },
  { method: 'GET', path: '/api/v1/auth/me', auth: 'Authenticated', purpose: 'Current user profile.' },
  { method: 'PATCH', path: '/api/v1/auth/me', auth: 'Authenticated', purpose: 'Update profile fields.' },
  { method: 'POST', path: '/api/v1/auth/me/avatar', auth: 'Authenticated', purpose: 'Upload profile avatar (image files).' },
  { method: 'GET', path: '/api/v1/users/me', auth: 'Authenticated', purpose: 'Current user details (also supports legacy API).' },
  { method: 'GET', path: '/api/v1/conversations', auth: 'Authenticated', purpose: 'List student conversations.' },
  { method: 'GET', path: '/api/v1/tutor', auth: 'Authenticated', purpose: 'Student tutoring conversation start/continue.' },
  { method: 'GET', path: '/api/v1/books', auth: 'Public', purpose: 'List published textbooks (student catalogue).' },
  { method: 'GET', path: '/api/v1/practice/sets', auth: 'Authenticated', purpose: 'List published practice/exam question sets.' },
  { method: 'GET', path: '/api/v1/docs/meta', auth: 'Public', purpose: 'Documentation visibility state (accessible + window).', notes: 'New documentation API.' },
  { method: 'GET', path: '/api/v1/docs/content', auth: 'Public', purpose: 'Published documentation content.', notes: '403/404 when disabled or unpublished.' },
  { method: 'GET', path: '/api/v1/docs/stats', auth: 'Public', purpose: 'Live aggregate statistics (safe, privacy-first).', notes: 'Aggregate counts only.' },
  { method: 'POST', path: '/api/v1/admin/docs/team', auth: 'Admin', purpose: 'Add a team member (with avatar upload).', notes: 'New documentation API.' },
  { method: 'PATCH', path: '/api/v1/admin/docs/team/:memberId', auth: 'Admin', purpose: 'Edit team member details.' },
  { method: 'DELETE', path: '/api/v1/admin/docs/team/:memberId', auth: 'Admin', purpose: 'Remove a team member (confirmed members are protected).' },
];

const DATA_LAYER = [
  { collection: 'users', description: 'Registered students, parents, admins.' },
  { collection: 'conversations', description: 'Class 3 AI Tutor chat sessions (title, share tokens).' },
  { collection: 'messages', description: 'Individual chat messages.' },
  { collection: 'books', description: 'Textbook catalogue (title, metadata, publication state).' },
  { collection: 'book_chunks', description: 'PDF chunks with page ranges, chapters, embeddings metadata.' },
  { collection: 'ingestion_jobs', description: 'Async book ingestion state and warnings.' },
  { collection: 'documentation_contents', description: 'Singleton documentation draft + version + settings (new).' },
  { collection: 'documentation_versions', description: 'Published documentation snapshots (new).' },
  { collection: 'practice_question_sets / practice_questions / practice_attempts', description: 'Class 3 Practice & Exam system.' },
  { collection: 'ai_usage', description: 'AI generation usage records (admin analytics).' },
  { collection: 'notices + attachments', description: 'University notices with uploaded documents.' },
  { collection: 'uploads (GridFS)', description: 'Binary files: textbooks, notices, avatars, team avatars (new).' },
];

const AI_LAYER = [
  { step: 'Language detection', detail: 'Script detection (Bangla/Banglish/English) via text.utils.' },
  { step: 'Banglish processing', detail: 'Query variants via retrievalQueryForms for search-optimized forms.' },
  { step: 'Textbook retrieval', detail: 'Lexical keyword scoring over published books (BookChunk). Only published books are eligible.' },
  { step: 'Context construction', detail: 'Prompt built from retrieved passages; citations prepared.' },
  { step: 'Provider routing', detail: 'Resolved via settings: provider + model + fallback chain (ai.provider/ai.model/ai.fallbacks).' },
  { step: 'LLM generation', detail: 'OpenRouter → Gemini 2.5 Flash Lite. fast/balanced/accurate modes map to ai.modelFast / ai.model / ai.modelAccurate.' },
  { step: 'Citation validation', detail: 'Server-side validation of cited books and page ranges before answering.' },
  { step: 'Insufficient-context handling', detail: 'Honest fallbacks when retrieval is weak; no invented content.' },
  { step: 'Safety', detail: 'Response sanitization, input sanitization, rate limiting (global + AI limiter).' },
];

const ROADMAP_ENTRIES: Record<string, Array<{ item: string; description: string }>> = {
  shortTerm: [
    { item: 'Improve AI tutoring', description: 'Better retrieval ranking, citation quality and localized language handling.' },
    { item: 'Quality-of-life UX', description: 'Faster page loads, better dark mode, responsive tweaks across tablets and mobile.' },
    { item: 'Local infrastructure', description: 'Caching, CDN usage and redundancy for the Vercel deployment.' },
  ],
  midTerm: [
    { item: 'Teacher-oriented features', description: 'Assignment management, classroom dashboards and teacher profiles.' },
    { item: 'More classes and subjects', description: 'JSC, Higher Secondary and additional language lessons.' },
    { item: 'More question types', description: 'Additional question formats based on textbook structure.' },
  ],
  longTerm: [
    { item: 'Personalized learning', description: 'Adaptive tutoring based on long-term student progress and learning gaps.' },
    { item: 'Scalable education infrastructure', description: 'Horizontal scaling, larger textbooks and multi-tenant support.' },
    { item: 'Student progress analytics', description: 'Learning path visualization and performance dashboards.' },
  ],
};

/* ------------------------------------------------------------------ */
/* Public page                                                        */
/* ------------------------------------------------------------------ */

export function DocsPage() {
  const [content, setContent] = useState<DocsContent | null>(null);
  const [meta, setMeta] = useState<{ accessible: boolean; version: number; updatedAt: string } | null>(null);
  const [stats, setStats] = useState<PublicDocStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsMeta, docsContent, docsStats] = await Promise.all([getDocsMeta(), getDocsContent(), getDocsStats()]);
      setMeta(docsMeta);
      setContent(docsContent);
      setStats(docsStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documentation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const refreshStats = async () => {
    setStatsRefreshing(true);
    try {
      setStats(await getDocsStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh statistics.');
    } finally {
      setStatsRefreshing(false);
    }
  };

  const searchTerm = search.trim().toLowerCase();
  const visibleSections = SECTION_DEFS.filter((section) => {
    if (!searchTerm) return true;
    const text = section.text + blocksText(content ? [{ id: section.id, heading: section.label, body: [] }] : []);
    if (section.label.toLowerCase().includes(searchTerm) || text.toLowerCase().includes(searchTerm)) return true;
    return sectionVisibleByContent(section, searchTerm);
  });

  function sectionVisibleByContent(section: SectionDef, term: string): boolean {
    if (!content) return true;
    const h = (s: { heading?: string; body?: string[] }) => `${s.heading ?? ''} ${(s.body ?? []).join(' ')}`.toLowerCase();
    if (section.id === 'pitch-deck') return content.pitchDeck.some((b) => h(b).includes(term));
    if (section.id === 'product-overview') return content.productOverview.some((b) => h(b).includes(term));
    if (section.id === 'feature-matrix') return content.featureMatrix.some((f) => `${f.name} ${f.description} ${f.route ?? ''}`.toLowerCase().includes(term));
    if (section.id === 'roadmap') return content.roadmap.some((r) => `${r.item} ${r.description}`.toLowerCase().includes(term));
    if (section.id === 'changelog') return content.changelog.some((c) => `${c.title} ${c.version}`.toLowerCase().includes(term));
    if (section.id === 'team') return content.teamMembers.some((m) => `${m.name} ${m.role} ${m.contact ?? ''}`.toLowerCase().includes(term));
    return true;
  }

  const exportMarkdown = () => {
    if (!content) return;
    const lines: string[] = [];
    lines.push('# Shikhi Bondju AI Tutor — Documentation', '');
    if (meta?.version) lines.push(`Documentation version: ${meta.version}`);
    lines.push('');
    for (const block of content.pitchDeck) {
      lines.push(`## ${block.heading}`, '');
      lines.push(...block.body, '');
    }
    for (const row of content.featureMatrix) {
      lines.push(`- [${row.status}] ${row.name}${row.route ? ` (${row.route})` : ''} — ${row.description}`);
    }
    lines.push('', '## Team Infyners', '');
    for (const member of content.teamMembers) {
      lines.push(`- ${member.name} — ${member.role} — ${member.contact ?? ''}${member.isConfirmed ? ' (confirmed)' : ''}`);
    }
    if (stats) {
      lines.push('', '## Live Statistics', '');
      Object.entries(stats).forEach(([key, value]) => {
        if (key === 'unavailable' || key === 'metricsUnavailable' || key === 'generatedAt') return;
        if (value === null) lines.push(`- ${key}: not available`);
        else if (typeof value === 'number') lines.push(`- ${key}: ${value}`);
      });
    }
    lines.push('');
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shikhi-bondju-docs.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.document.body.classList.add('docs-print');
    window.setTimeout(() => {
      window.document.body.classList.remove('docs-print');
      window.print();
    }, 120);
  };

  if (loading) {
    return (
      <div className="pg-app" style={{ paddingBottom: 72 }}>
        <div className="pg-container" style={{ maxWidth: 920, paddingTop: 28 }}>
          <SkeletonBox width="40%" height={28} style={{ marginBottom: 20 }} />
          <SkeletonBox width="100%" height={14} style={{ marginBottom: 10 }} />
          <SkeletonBox width="95%" height={14} style={{ marginBottom: 8 }} />
          <SkeletonBox width="80%" height={14} style={{ marginBottom: 26 }} />
          {[1, 2, 3].map((index) => (
            <SkeletonBox key={index} width="100%" height={110} style={{ marginBottom: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pg-app" style={{ paddingBottom: 72 }}>
        <div className="pg-container" style={{ maxWidth: 720, paddingTop: 72 }}>
          <EmptyState icon="⚙️" title="Could not load documentation" description={error} />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button variant="secondary" onClick={() => void loadAll()}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!content || !meta) {
    return (
      <div className="pg-app" style={{ paddingBottom: 72 }}>
        <div className="pg-container" style={{ maxWidth: 720, paddingTop: 72 }}>
          {meta && !meta.accessible ? (
            <EmptyState icon="🚧" title="Documentation is not available" description="Administrators have disabled public documentation. Try again later." />
          ) : (
            <EmptyState icon="📄" title="Documentation is not published yet" description="It will appear here once administrators publish a version." />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="docs-page pg-app">
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <nav className="docs-nav" aria-label="Documentation sections">
            <h2 className="docs-nav-title">On this page</h2>
            <ul className="docs-nav-list">
              {visibleSections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className="docs-nav-link"
                    aria-label={`Go to ${section.label}`}
                    onClick={() => document.getElementById(`docs-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    {section.label}
                  </button>
                </li>
              ))}
              {visibleSections.length === 0 && <li className="docs-nav-empty">No sections match</li>}
            </ul>
            <div className="docs-sidebar-actions">
              <Button className="docs-btn-full" variant="secondary" onClick={exportMarkdown} size="sm">Export Markdown</Button>
              <Button className="docs-btn-full" variant="secondary" onClick={exportPdf} size="sm">Print to PDF</Button>
            </div>
          </nav>
        </aside>

        <article className="docs-article">
          <header className="docs-header">
            <div>
              <span className="docs-badge-live">LIVE DOCUMENTATION</span>
              <h1 className="docs-title">Shikhi Bondju AI Tutor Documentation</h1>
              <p className="docs-subtitle">
                Project pitch, technical documentation, system architecture, AI data flow and system statistics.{' '}
                {meta.version ? `Version ${meta.version}` : 'Not published yet'}
                {meta.version && meta.updatedAt ? ` · Updated ${new Date(meta.updatedAt).toLocaleDateString()}` : ''}.
              </p>
              <div className="docs-header-actions">
                <Button onClick={exportMarkdown}>Export Markdown</Button>
                <Button variant="secondary" onClick={exportPdf}>Print to PDF</Button>
              </div>
            </div>
            <div className="docs-search">
              <input
                type="search"
                placeholder="Search documentation…"
                aria-label="Search documentation"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <MdContentPasteSearch aria-hidden="true" />
            </div>
          </header>

          {visibleSections.map((section) => (
            <section key={section.id} id={`docs-${section.id}`} className="docs-section">
              <SectionHeader id={section.id} label={section.label} icon={section.icon} />
              <DocsSectionContent sectionId={section.id} content={content} stats={stats} refreshStats={refreshStats} refreshing={statsRefreshing} />
            </section>
          ))}
          {visibleSections.length === 0 && <EmptyState icon="🔍" title="No sections matched" description={`No sections match "${searchTerm}".`} />}

          <footer className="docs-footer">
            <div className="docs-footer-links">
              <a href="#pitch-deck">Pitch deck</a>
              <a href="#feature-matrix">Feature matrix</a>
              <a href="#live-statistics">Live statistics</a>
            </div>
            <div className="docs-footer-meta">
              {meta.version ? `Documentation version: ${meta.version}` : ''}
              {' · '}
              {stats?.generatedAt ? `Stats generated ${new Date(stats.generatedAt).toLocaleString()}` : 'Stats unavailable'}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

function SectionHeader({ id, label, icon: Icon }: { id: string; label: string; icon: ComponentType }) {
  return (
    <h2 className="docs-section-title">
      <Icon aria-hidden="true" />
      {label}
      <a className="docs-anchor" href={`#${id}`} aria-label={`Link to ${label}`} onClick={(event) => event.preventDefault()}>#</a>
    </h2>
  );
}

function DocsSectionContent({
  sectionId,
  content,
  stats,
  refreshStats,
  refreshing,
}: {
  sectionId: string;
  content: DocsContent;
  stats: PublicDocStats | null;
  refreshStats: () => void;
  refreshing: boolean;
}) {
  switch (sectionId) {
    case 'pitch-deck':
      return (
        <div className="docs-pitch">
          {content.pitchDeck.length === 0 ? <EmptyState icon="📝" title="Pitch deck is empty" /> : content.pitchDeck.map((block) => (
            <PitchDeckBlock key={block.id} block={block} />
          ))}
        </div>
      );

    case 'product-overview':
      return (
        <div className="docs-overview">
          {content.productOverview.length === 0 ? <EmptyState icon="📚" title="Product overview is empty" /> : content.productOverview.map((block) => (
            <PitchDeckBlock key={block.id} block={block} />
          ))}
        </div>
      );

    case 'feature-matrix':
      return <FeatureMatrixTable features={content.featureMatrix} />;

    case 'architecture':
      return <ArchitectureDiagram />;

    case 'ai-data-flow':
      return <AiDataFlowDiagram />;

    case 'technology-stack':
      return (
        <div className="docs-stack">
          {TECH_STACK.map((group) => (
            <div key={group.title} className="docs-stack-card">
              <h3>{group.title}</h3>
              <ul>
                {group.items.map(([name, detail]) => (
                  <li key={name}><strong>{name}</strong> — {detail}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );

    case 'api-reference':
      return (
        <div className="docs-api">
          <p className="docs-api-note">Endpoints documented from the actual Express routes. See the repository for the latest list.</p>
          <table className="docs-api-table">
            <thead>
              <tr><th>Endpoint</th><th>Method</th><th>Auth</th><th>Purpose</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {API_ROWS.map((row) => (
                <tr key={`${row.method} ${row.path}`}>
                  <td className="docs-api-path">{row.path}</td>
                  <td><Badge variant="info">{row.method}</Badge></td>
                  <td className="docs-api-auth">{row.auth}</td>
                  <td>{row.purpose}</td>
                  <td className="text-muted">{row.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'data-layer':
      return (
        <div className="docs-data-layer">
          <table>
            <thead><tr><th>Collection</th><th>Description</th></tr></thead>
            <tbody>
              {DATA_LAYER.map((row) => (
                <tr key={row.collection}><td className="docs-data-name">{row.collection}</td><td>{row.description}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'ai-layer':
      return (
        <ol className="docs-ai-steps">
          {AI_LAYER.map((step) => (
            <li key={step.step}>
              <strong>{step.step}</strong>
              <p>{step.detail}</p>
            </li>
          ))}
        </ol>
      );

    case 'roadmap':
      return (
        <div className="docs-roadmap">
          {(['shortTerm', 'midTerm', 'longTerm'] as const).map((category) => (
            <div key={category} className="docs-roadmap-card">
              <h3>{category.replace('shortTerm', 'Short term').replace('midTerm', 'Mid term').replace('longTerm', 'Long term')}</h3>
              <ul>
                {(ROADMAP_ENTRIES[category] ?? []).map((entry) => (
                  <li key={entry.item}><strong>{entry.item}</strong> — {entry.description}</li>
                ))}
                {content.roadmap.filter((entry) => entry.category === category).map((entry) => (
                  <li key={`${entry.item}-cms`}><Badge variant="muted">CMS:</Badge> {entry.item} — {entry.description}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );

    case 'team':
      return (
        <div className="docs-team">
          {content.teamMembers.length === 0 ? <EmptyState icon="👥" title="Team is empty" /> : content.teamMembers.map((member) => (
            <div key={member.id} className="docs-team-card">
              <img className="docs-team-avatar" src={getTeamAvatarUrl(member.id)} alt={member.name} />
              <div>
                <h3>{member.name}</h3>
                <p>{member.role}</p>
                {member.contact ? <p className="docs-team-contact">{member.contact}</p> : null}
                {member.isConfirmed ? <Badge variant="success">Confirmed</Badge> : null}
              </div>
            </div>
          ))}
        </div>
      );

    case 'live-statistics':
      return (
        <div className="docs-stats">
          <div className="docs-stats-header">
            <div>
              <h3>Live, privacy-safe statistics</h3>
              <p className="text-muted">Aggregate counts only — no personal data, conversations or credentials. {stats?.generatedAt ? `Generated ${new Date(stats.generatedAt).toLocaleString()}.` : ''}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void refreshStats()} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
          {stats === null && <SkeletonBox width="40%" height={24} />}
          {stats && (
            <div className="docs-stats-grid">
              <DocsStatCard label="Registered users" value={stats.totalRegisteredUsers} unavailable={stats.unavailable || stats.totalRegisteredUsers === null} />
              <DocsStatCard label="Conversations" value={stats.totalConversations} unavailable={stats.unavailable || stats.totalConversations === null} />
              <DocsStatCard label="Messages" value={stats.totalMessages} unavailable={stats.unavailable || stats.totalMessages === null} />
              <DocsStatCard label="Published books" value={stats.totalPublishedBooks} unavailable={stats.unavailable || stats.totalPublishedBooks === null} />
              <DocsStatCard label="Practice exams" value={stats.totalPracticeExamAttempts} unavailable={stats.unavailable || stats.totalPracticeExamAttempts === null} />
              <DocsStatCard label="Published practice sets" value={stats.totalPublishedPracticeSets} unavailable={stats.unavailable || stats.totalPublishedPracticeSets === null} />
              <DocsStatCard label="AI usage records" value={stats.totalAIUsageRecords} unavailable={stats.unavailable || stats.totalAIUsageRecords === null} />
              <DocsStatCard label="Active users (recent)" value={stats.activeUsers} unavailable={stats.unavailable || stats.activeUsers === null} />
              {stats.unavailable && stats.metricsUnavailable.length > 0 && (
                <p className="docs-stats-unavailable">Some statistics are currently unavailable: {stats.metricsUnavailable.join(', ')}.</p>
              )}
            </div>
          )}
        </div>
      );

    case 'changelog':
      return (
        <div className="docs-changelog">
          {content.changelog.length === 0 ? <EmptyState icon="📜" title="Changelog is empty" /> : content.changelog.map((entry) => (
            <div key={entry.version} className="docs-changelog-entry">
              <div className="docs-changelog-head">
                <span className="docs-changelog-version">v{entry.version}</span>
                <span className="docs-changelog-date">{entry.date}</span>
                <h3>{entry.title}</h3>
              </div>
              {entry.items.length > 0 && (
                <ul>
                  {entry.items.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      );

    default:
      return <EmptyState icon="⚡" title="Section not found" />;
  }
}

function DocsStatCard({ label, value, unavailable }: { label: string; value: number | null; unavailable: boolean }) {
  return (
    <div className="docs-stat">
      <strong className="docs-stat-value">{unavailable || value === null ? '—' : value}</strong>
      <span className="docs-stat-label">{label}</span>
      {unavailable && <span className="docs-stat-unavail">Unavailable</span>}
    </div>
  );
}

function FeatureMatrixTable({ features }: { features: DocsFeatureRow[] }) {
  const statusMeta: Record<DocsFeatureRow['status'], { icon: ComponentType<{ size?: number }>; color: string; label: string }> = {
    completed: { icon: MdFactCheck, color: 'var(--color-success)', label: 'Completed' },
    in_progress: { icon: MdTimeline, color: 'var(--color-warning)', label: 'In progress' },
    planned: { icon: MdArrowForward, color: 'var(--color-primary)', label: 'Planned' },
  };
  if (!features.length) return <EmptyState icon="🗺️" title="Feature matrix is empty" />;
  return (
    <table className="docs-features">
      <thead>
        <tr><th>Feature</th><th>Status</th><th>Description</th><th>Route</th></tr>
      </thead>
      <tbody>
        {features.map((row) => {
          const meta = statusMeta[row.status] ?? statusMeta.planned;
          const badgeVariant = row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'warning' : 'info';
          const Icon = meta.icon;
          return (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td><Badge variant={badgeVariant}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={13} aria-hidden="true" /> {meta.label}</span></Badge></td>
              <td>{row.description}</td>
              <td>{row.route ? <code className="docs-route-link">{row.route}</code> : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default DocsPage;
