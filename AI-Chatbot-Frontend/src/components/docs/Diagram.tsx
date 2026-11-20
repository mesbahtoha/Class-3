import type { DocsBlock } from '@/types';

/* Inline SVG diagrams rendered with design-system tokens (theme-aware). */

const STROKE = 'var(--text-secondary)';
const FILL = 'var(--text-primary)';
const BG = 'var(--bg-surface)';
const BORDER = 'var(--border-color)';

function Box({ x, y, width, height, title, subtitle, accent }: { x: number; y: number; width: number; height: number; title: string; subtitle?: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={12} fill={BG} stroke={accent ? 'var(--color-primary)' : BORDER} strokeWidth={accent ? 2 : 1} />
      <rect x={x} y={y} width={width} height={24} rx={10} fill="transparent" />
      <text x={x + 16} y={y + 17} fontFamily="Outfit, system-ui, sans-serif" fontSize={13} fontWeight={800} fill={accent ? 'var(--text-primary)' : FILL}>{title}</text>
      {subtitle && <text x={x + 16} y={y + 44} fontFamily="Outfit, system-ui, sans-serif" fontSize={12} fill={STROKE}>{subtitle}</text>}
    </g>
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} fontFamily="Outfit, system-ui, sans-serif" fontSize={12} fill={STROKE} textAnchor="middle">{text}</text>;
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <path
      d={`M ${x1} ${y1} L ${x2 - 10} ${y2}`}
      stroke={STROKE}
      strokeWidth={1.5}
      fill="none"
      markerEnd="url(#arrow)"
    />
  );
}

export function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 820 420" width="100%" height="420" style={{ maxHeight: 420, borderRadius: 12 }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="currentColor" />
        </marker>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
      <Box x={10} y={10} width={240} height={390} title="Students &amp; admins (React frontend)" subtitle="Public /docs, /api/v1/docs, /admin/docs, /practice, /tutor" />
      <Box x={280} y={10} width={270} height={390} accent title="Node.js + Express 4" subtitle="Routes → validators → services" />
      <Box x={560} y={10} width={250} height={110} title="Docs services" subtitle="Content service, versioning, visibility" />
      <Box x={560} y={150} width={250} height={110} title="Practice services" subtitle="Attempt lifecycle, deterministic evaluator" />
      <Box x={560} y={290} width={250} height={110} title="Admin &amp; AI services" subtitle="CMS, RAG retrieval, AI providers" />
      <Box x={100} y={220} width={160} height={80} title="MongoDB" subtitle="documentation_contents, versions" />
      <Box x={720} y={220} width={100} height={80} title="OpenRouter" subtitle="Gemini 2.5 Flash Lite" />
      <Label x={190} y={410} text="HTTP /api/v1/*" />
      <Label x={640} y={410} text="AI calls" />
      <Arrow x1={270} y1={80} x2={280} y2={80} />
      <Arrow x1={270} y1={200} x2={280} y2={200} />
      <Arrow x1={270} y1={340} x2={280} y2={340} />
      <Arrow x1={560} y1={65} x2={790} y2={65} />
      <Arrow x1={560} y1={205} x2={790} y2={205} />
      <Arrow x1={560} y1={345} x2={820} y2={360} />
      <Arrow x1={400} y1={100} x2={400} y2={270} />
      <Arrow x1={430} y1={300} x2={720} y2={300} />
    </svg>
  );
}

export function AiDataFlowDiagram() {
  const steps = [
    { id: 'detect', label: 'Language detection', text: 'Script detection + normalization (Bangla/Banglish/English)' },
    { id: 'banglish', label: 'Banglish processing', text: 'Query variants for search-optimized forms' },
    { id: 'retrieve', label: 'Textbook retrieval', text: 'Lexical keyword scoring over PUBLISHED books (BookChunk)' },
    { id: 'context', label: 'Context construction', text: 'Build prompt from retrieved passages with citations' },
    { id: 'route', label: 'Provider routing', text: 'Resolve provider + model (fast/balanced/accurate modes)' },
    { id: 'generate', label: 'LLM generation', text: 'Answer generation via OpenRouter (Gemini 2.5 Flash Lite)' },
    { id: 'cite', label: 'Citation validation', text: 'Server-side validation of cited books/pages' },
    { id: 'insufficient', label: 'Insufficient-context handling', text: 'Honest fallbacks when no good context exists' },
    { id: 'respond', label: 'Student response', text: 'Textbook-grounded answer with source links' },
  ];
  const W = 1100;
  const H = 380;
  const headerY = 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="380" style={{ borderRadius: 12 }} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow2" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="currentColor" />
        </marker>
      </defs>
      {steps.map((step, index) => {
        const x = 120 + index * (W - 240) / (steps.length - 1);
        const y = 100;
        return (
          <g key={step.id}>
            <circle cx={x} cy={y} r={22} fill="var(--color-primary)" />
            <text x={x} y={y + 7} fontFamily="Outfit, system-ui, sans-serif" fontSize={12} fontWeight={800} fill="var(--text-primary)" textAnchor="middle">{index + 1}</text>
            <text x={x} y={y + 46} fontFamily="Outfit, system-ui, sans-serif" fontSize={13} fontWeight={800} fill={FILL} textAnchor="middle">{step.label}</text>
            <text x={x} y={y + 65} fontFamily="Outfit, system-ui, sans-serif" fontSize={11} fill={STROKE} textAnchor="middle">{step.text}</text>
          </g>
        );
      })}
      {steps.slice(0, -1).map((step, index) => {
        const x1 = 120 + index * (W - 240) / (steps.length - 1);
        const x2 = 120 + (index + 1) * (W - 240) / (steps.length - 1);
        return (
          <path key={`${step.id}-arrow`} d={`M ${x1 + 90} 110 L ${x2 - 90} 110`} stroke={STROKE} strokeWidth={1.5} fill="none" markerEnd="url(#arrow2)" />
        );
      })}
      <text x={110} y={headerY} fontFamily="Outfit, system-ui, sans-serif" fontSize={16} fontWeight={800} fill={FILL}>AI Tutor data flow</text>
      <rect x={0} y={headerY + 20} width={W} height={1} fill={BORDER} />
      <rect x={0} y={headerY + 20} width={4} height={270} rx={2} fill="var(--color-primary)" />
      <rect x={0} y={headerY + 20} width={120} height={28} rx={10} fill={BG} stroke={BORDER} />
      <text x={60} y={headerY + 33} fontFamily="Outfit, system-ui, sans-serif" fontSize={12} textAnchor="middle" fill={STROKE}>Student question</text>
      <text x={60} y={headerY + 60} fontFamily="Outfit, system-ui, sans-serif" fontSize={11} fill={STROKE}>Enters the pipeline from the web app.</text>
    </svg>
  );
}

/* Block renderer: pitch deck section type. */
export function PitchDeckBlock({ block }: { block: DocsBlock }) {
  return (
    <div className="docs-pitch-block">
      <h2 className="docs-pitch-heading">{block.heading}</h2>
      {block.body.map((paragraph, index) => (
        <p key={index} className="docs-pitch-paragraph">{paragraph}</p>
      ))}
    </div>
  );
}
