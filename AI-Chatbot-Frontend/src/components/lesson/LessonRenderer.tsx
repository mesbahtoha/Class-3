import { useState } from 'react';
import type { LessonPlan, TutorSlide } from '@/types';
import { Button } from '@/components/ui/Button';

/**
 * Trusted lesson slide renderer. Only allow-listed slide types are rendered
 * with predefined components ,  model-generated HTML/JS/SVG is never executed.
 * Unknown types fail safely (slide is skipped with a notice).
 */

function FractionBar() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true" style={{ margin: '12px 0' }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 34,
            borderRadius: 8,
            background: i <= 1 ? 'var(--color-primary)' : 'var(--bg-surface-2)',
            border: '1px solid var(--border-color)',
          }}
        />
      ))}
    </div>
  );
}

function NumberLine() {
  return (
    <div style={{ margin: '12px 0', padding: '10px 4px', borderTop: '3px solid var(--color-primary)', position: 'relative' }} aria-hidden="true">
      <div className="flex justify-between text-xs text-muted" style={{ marginTop: 4 }}>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
    </div>
  );
}

function Shapes() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true" style={{ margin: '12px 0' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#ffb020' }} />
      <div style={{ width: 44, height: 44, borderRadius: 8, background: '#22b573' }} />
      <div style={{ width: 0, height: 0, borderLeft: '24px solid transparent', borderRight: '24px solid transparent', borderBottom: '42px solid #4d7cfe' }} />
    </div>
  );
}

function Tally() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true" style={{ margin: '12px 0', fontSize: 22, fontWeight: 700 }}>
      {['।', '।', '।', '।', '।'].map((t, i) => (
        <span key={i}>{t}</span>
      ))}
    </div>
  );
}

function Diagram({ kind }: { kind?: TutorSlide['diagramKind'] }) {
  if (kind === 'fraction-bar') return <FractionBar />;
  if (kind === 'number-line') return <NumberLine />;
  if (kind === 'shapes') return <Shapes />;
  if (kind === 'tally') return <Tally />;
  return null;
}

function SlideBody({ slide }: { slide: TutorSlide }) {
  switch (slide.type) {
    case 'TITLE':
      return <h3 style={{ fontSize: 22, marginBottom: 8 }}>🎉 {slide.title}</h3>;
    case 'EXPLANATION':
    case 'SUMMARY':
      return (
        <>
          <h4 style={{ fontSize: 16, marginBottom: 6 }}>{slide.type === 'SUMMARY' ? `✅ ${slide.title}` : slide.title}</h4>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{slide.body}</p>
        </>
      );
    case 'EXAMPLE':
      return (
        <div style={{ background: 'var(--bg-surface-2)', borderRadius: 12, padding: 14 }}>
          <h4 style={{ fontSize: 15, marginBottom: 6 }}>💡 {slide.title}</h4>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{slide.body}</p>
        </div>
      );
    case 'IMAGE':
      return (
        <>
          <h4 style={{ fontSize: 15, marginBottom: 6 }}>{slide.title}</h4>
          {slide.imageUrl ? (
            <img src={slide.imageUrl} alt={slide.title} style={{ maxWidth: '100%', borderRadius: 12 }} loading="lazy" />
          ) : (
            <p className="text-muted">ছবি পাওয়া যায়নি।</p>
          )}
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{slide.body}</p>
        </>
      );
    case 'DIAGRAM':
      return (
        <>
          <h4 style={{ fontSize: 15, marginBottom: 6 }}>📊 {slide.title}</h4>
          <Diagram kind={slide.diagramKind} />
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{slide.body}</p>
        </>
      );
    case 'INTERACTIVE':
      return (
        <>
          <h4 style={{ fontSize: 15, marginBottom: 6 }}>🎮 {slide.title}</h4>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{slide.body}</p>
        </>
      );
    case 'QUIZ':
      return <QuizSlide slide={slide} />;
    default:
      return <p className="text-muted">এই স্লাইডটি দেখানো যাচ্ছে না।</p>;
  }
}

function QuizSlide({ slide }: { slide: TutorSlide }) {
  const [picked, setPicked] = useState<number | null>(null);
  const options = slide.quizOptions ?? [];
  return (
    <div>
      <h4 style={{ fontSize: 15, marginBottom: 6 }}>✏️ {slide.title}</h4>
      <p style={{ marginBottom: 10 }}>{slide.body}</p>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {options.map((opt, i) => {
          const correct = picked !== null && i === slide.quizAnswerIndex;
          const wrong = picked === i && i !== slide.quizAnswerIndex;
          return (
            <button
              key={i}
              onClick={() => setPicked(i)}
              disabled={picked !== null}
              className="btn btn-secondary"
              style={{
                textAlign: 'left',
                borderColor: correct ? '#22b573' : wrong ? '#e5484d' : undefined,
                background: correct ? 'rgba(34,181,115,0.12)' : wrong ? 'rgba(229,72,77,0.10)' : undefined,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p style={{ marginTop: 8, fontWeight: 600 }}>
          {picked === slide.quizAnswerIndex ? '🎉 খুব ভালো! সঠিক হয়েছে!' : 'চেষ্টা ভালো ছিল! আবার বুঝে নিই।'}
        </p>
      )}
    </div>
  );
}

const ALLOWED = new Set(['TITLE', 'EXPLANATION', 'IMAGE', 'DIAGRAM', 'EXAMPLE', 'INTERACTIVE', 'QUIZ', 'SUMMARY']);

export function LessonRenderer({ lesson }: { lesson: LessonPlan }) {
  const slides = (lesson.slides ?? []).filter((s) => ALLOWED.has(s.type));
  const [index, setIndex] = useState(0);
  if (!slides.length) return <p className="text-muted">এই পাঠটি এখনো তৈরি হয়নি।</p>;
  const slide = slides[index];
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="card" style={{ padding: 20, maxWidth: 640 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span className="text-xs text-muted">স্লাইড {index + 1} / {slides.length}</span>
        <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--bg-surface-2)', margin: '0 12px', overflow: 'hidden' }}>
          <div style={{ width: `${((index + 1) / slides.length) * 100}%`, height: '100%', background: 'var(--color-primary)', transition: reduced ? 'none' : 'width 0.25s' }} />
        </div>
      </div>
      <h3 style={{ fontSize: 18, marginBottom: 10 }}>{lesson.title}</h3>
      <div key={index}>
        <SlideBody slide={slide} />
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          ← আগেরটি
        </Button>
        {index < slides.length - 1 ? (
          <Button onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}>পরেরটি →</Button>
        ) : (
          <span className="text-sm font-semibold">🎓 পাঠ শেষ!</span>
        )}
      </div>
    </div>
  );
}
