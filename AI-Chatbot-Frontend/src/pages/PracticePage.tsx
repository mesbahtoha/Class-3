import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Q {
  q: string;
  options: string[];
  a: number;
}

const SETS: Record<string, Q[]> = {
  'গণিত': [
    { q: '১/২ + ১/২ = কত?', options: ['১', '২', '১/৪'], a: 0 },
    { q: '৭ + ৫ = ?', options: ['১১', '১২', '১৩'], a: 1 },
    { q: 'এক ডজনে কয়টি?', options: ['১০টি', '১২টি', '২০টি'], a: 1 },
  ],
  'বাংলা': [
    { q: '“বই” শব্দের প্রথম অক্ষর কোনটি?', options: ['ব', 'ই', 'ঐ'], a: 0 },
    { q: 'বাক্য কাকে বলে?', options: ['একটি শব্দ', 'মনের ভাব প্রকাশ করা শব্দগুচ্ছ', 'একটি অক্ষর'], a: 1 },
  ],
  'English': [
    { q: 'Apple starts with which letter?', options: ['A', 'B', 'C'], a: 0 },
    { q: 'Cat is a…', options: ['bird', 'animal', 'fish'], a: 1 },
  ],
};

/** Practice quizzes with instant encouragement (offline, no backend needed). */
export function PracticePage() {
  const [subject, setSubject] = useState('গণিত');
  const [picked, setPicked] = useState<Record<number, number>>({});
  const questions = SETS[subject] ?? [];

  const score = questions.filter((q, i) => picked[i] === q.a).length;
  const done = Object.keys(picked).length === questions.length;

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 700, paddingTop: 28 }}>
        <span className="pg-badge pg-badge-mint" style={{ marginBottom: 10, display: 'inline-flex' }}>Practice stars await</span>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}>Practice time</h1>
        <p style={{ color: '#64748B', marginBottom: 16 }}>Small questions, instant cheers. Start with the matching game below.</p>
        <div className="pg-card pg-card-yellow-shadow" style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>English For Today, Unit 3, Lesson 5</div>
          <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 14.5 }}>Page 45, Activity C. Match each request with the right reply.</p>
          <Link to="/exercise/match-requests" className="pg-btn-candy" style={{ textDecoration: 'none' }}>
            Open the matching game
          </Link>
        </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.keys(SETS).map((s) => (
          <button key={s} className={s === subject ? 'pg-btn-candy' : 'pg-btn-secondary'} style={{ minHeight: 42, padding: '8px 18px', fontSize: 14 }} onClick={() => { setSubject(s); setPicked({}); }}>
            {s}
          </button>
        ))}
      </div>
      {questions.map((q, i) => (
        <div key={i} className="pg-card" style={{ padding: 18, marginBottom: 12 }}>
          <p style={{ fontWeight: 700, marginBottom: 10 }}>{i + 1}. {q.q}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.options.map((opt, j) => {
              const chosen = picked[i] === j;
              const correct = picked[i] !== undefined && j === q.a;
              const wrong = chosen && j !== q.a;
              return (
                <button
                  key={j}
                  className="pg-btn-secondary"
                  style={{
                    justifyContent: 'flex-start',
                    borderColor: correct ? '#34D399' : wrong ? '#F472B6' : undefined,
                    background: correct ? '#D1FAE5' : wrong ? '#FCE7F3' : undefined,
                  }}
                  disabled={picked[i] !== undefined}
                  onClick={() => setPicked((p) => ({ ...p, [i]: j }))}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {picked[i] !== undefined && (
            <p style={{ marginTop: 10, fontWeight: 700 }}>
              {picked[i] === q.a ? 'Great job. That is correct.' : 'Good try. Let us learn it again.'}
            </p>
          )}
        </div>
      ))}
      {done && (
        <div className="pg-card pg-card-mint-shadow" style={{ padding: 18, textAlign: 'center' }}>
          Your score: {score} out of {questions.length}. {score === questions.length ? 'Amazing work.' : 'Keep trying.'}
        </div>
      )}
      <p style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/tutor" className="pg-btn-secondary" style={{ textDecoration: 'none' }}>Back to tutor</Link>
        <Link to="/exercise/match-requests" className="pg-btn-candy" style={{ textDecoration: 'none' }}>
          Match the Requests, Unit 3 Lesson 5
        </Link>
      </p>
      </div>
    </div>
  );
}
