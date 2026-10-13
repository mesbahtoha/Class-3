import { useState } from 'react';
import type { QuizPreview, TutorSource } from '@/types';
import { Button } from '@/components/ui/Button';

/** Quiz card rendered from validated tutor quiz data + answer reporting. */
export function QuizCard({ quiz, sources }: { quiz: QuizPreview; sources?: TutorSource[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  if (!quiz || !Array.isArray(quiz.options) || quiz.options.length < 2) return null;
  const answerIndex = Math.min(Math.max(0, quiz.answerIndex ?? 0), quiz.options.length - 1);

  return (
    <div className="card" style={{ padding: 16, marginTop: 12, border: '2px solid var(--color-primary)' }}>
      <div className="font-bold" style={{ marginBottom: 4 }}>📝 অনুশীলন করো</div>
      <p style={{ marginBottom: 10 }}>{quiz.question}</p>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {quiz.options.map((opt, i) => {
          const correct = picked !== null && i === answerIndex;
          const wrong = picked === i && i !== answerIndex;
          return (
            <button
              key={i}
              className="btn btn-secondary"
              style={{
                textAlign: 'left',
                borderColor: correct ? '#22b573' : wrong ? '#e5484d' : undefined,
                background: correct ? 'rgba(34,181,115,0.12)' : wrong ? 'rgba(229,72,77,0.10)' : undefined,
              }}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p style={{ marginTop: 8, fontWeight: 600 }}>
          {picked === answerIndex ? '🎉 সাবাশ! একদম ঠিক!' : 'ভালো চেষ্টা! ভুল থেকে শিখি। আবার চেষ্টা করো।'}
        </p>
      )}
      {sources?.length ? (
        <p className="text-xs text-muted" style={{ marginTop: 8 }}>
          📖 সূত্র: {sources.map((s) => s.bookTitle).filter(Boolean).slice(0, 2).join(', ')}
          {sources[0]?.pageStart ? ` (পৃষ্ঠা ${sources[0].pageStart})` : ''}
        </p>
      ) : null}
      <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>আবার চেষ্টা করো</Button>
      </div>
    </div>
  );
}
