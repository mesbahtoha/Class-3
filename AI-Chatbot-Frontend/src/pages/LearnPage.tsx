import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LessonRenderer } from '@/components/lesson/LessonRenderer';
import type { LessonPlan } from '@/types';

/** Structured lesson player: renders validated lesson JSON with trusted components. */
const STARTER_LESSON: LessonPlan = {
  lessonId: 'starter-requests',
  title: 'Making requests and replies',
  subject: 'English',
  slides: [
    { type: 'TITLE', title: 'Making requests', body: 'Let us learn to ask politely and reply kindly.' },
    { type: 'EXPLANATION', title: 'What is a request?', body: 'A request asks for help in a polite way.\nExample: Can I borrow your pen, please?' },
    { type: 'EXAMPLE', title: 'Example', body: 'Request: Can you repeat that, please?\nReply: Sure. I am saying it again.' },
    { type: 'QUIZ', title: 'Quick question', body: 'A friend says: Can we meet at the library? What is the best reply?', quizOptions: ['Yes, please. I will see you at the library.', 'Sorry. I have only one pen.', 'Sorry, but I am reading it now.'], quizAnswerIndex: 0 },
    { type: 'SUMMARY', title: 'Today we learned', body: 'Match call with call, repeat with again, newspaper with reading, pen with one pen, meet with library. Great work.' },
  ],
};

export function LearnPage() {
  const [json, setJson] = useState('');
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [error, setError] = useState('');

  const loadJson = () => {
    setError('');
    try {
      const parsed = JSON.parse(json) as LessonPlan;
      const allowed = new Set(['TITLE', 'EXPLANATION', 'IMAGE', 'DIAGRAM', 'EXAMPLE', 'INTERACTIVE', 'QUIZ', 'SUMMARY']);
      if (!parsed || !Array.isArray(parsed.slides) || !parsed.slides.length) throw new Error('slides খালি');
      for (const s of parsed.slides) {
        if (!allowed.has(s.type)) throw new Error(`অজানা স্লাইড ধরন: ${s.type}`);
      }
      setLesson({ lessonId: parsed.lessonId || 'custom', title: parsed.title || 'পাঠ', subject: parsed.subject, slides: parsed.slides });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ভুল JSON');
    }
  };

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 720, paddingTop: 28 }}>
        <span className="pg-badge pg-badge-mint" style={{ marginBottom: 10, display: 'inline-flex' }}>Lesson player</span>
        <h1 style={{ fontSize: 30, marginBottom: 6 }}>Watch a lesson</h1>
        <p style={{ color: '#64748B', marginBottom: 16 }}>
          Paste lesson JSON from your teacher to view it here. Only safe slide types are allowed.
        </p>
        {!lesson && (
          <>
            <LessonRenderer lesson={STARTER_LESSON} />
            <div className="pg-card" style={{ padding: 18, marginTop: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Paste your own lesson (optional)</div>
              <textarea className="pg-input" rows={5} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"lessonId":"...","title":"...","slides":[...]}' style={{ width: '100%', fontFamily: 'monospace' }} />
              {error && <p style={{ color: '#DC2626', marginTop: 8 }}>Note: {error}</p>}
              <div style={{ marginTop: 10 }}>
                <button className="pg-btn-candy" onClick={loadJson}>Show lesson</button>
              </div>
            </div>
          </>
        )}
        {lesson && (
          <>
            <LessonRenderer lesson={lesson} />
            <div style={{ marginTop: 12 }}>
              <button className="pg-btn-secondary" onClick={() => setLesson(null)}>Back to starter lesson</button>
            </div>
          </>
        )}
        <p style={{ marginTop: 18 }}>
          <Link to="/tutor" className="pg-btn-secondary" style={{ textDecoration: 'none' }}>Back to tutor</Link>
        </p>
        <p style={{ marginTop: 12 }}>
          <Link to="/exercise/match-requests" className="pg-btn-candy" style={{ textDecoration: 'none' }}>Play Match the Requests</Link>
        </p>
      </div>
    </div>
  );
}
