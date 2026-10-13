import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { QuizCard } from '@/components/lesson/QuizCard';
import { guestChat, tutorChat, listBooks, makeTutorQuiz, sendTutorFeedback } from '@/lib/tutor';
import { getErrorMessage } from '@/lib/api';
import { useTutorStore } from '@/store/tutor.store';
import { useAuthStore } from '@/store/auth.store';
import { getLanguagePreference } from '@/components/chat/ChatComposer';
import { parseTextbookRef, MATCH_REQUESTS_PATH } from '@/lib/textbookRef';
import type { BookInfo, QuizPreview, TutorResponse, TutorSource } from '@/types';

interface Turn {
  id: number;
  question: string;
  response?: TutorResponse;
  error?: string;
  pending: boolean;
  quiz?: { quiz: QuizPreview; sources: TutorSource[] } | null;
  quizPending?: boolean;
  quizTried?: boolean;
  feedback?: 'up' | 'down' | null;
}

const EXAMPLES = [
  'Unit 3, Lesson 5, Page 45, Match the requests. Please solve this.',
  'Can I borrow your pen, please? What is the best reply?',
  'ভগ্নাংশ কী? সহজ করে বোঝাও',
  'vognangsho ki? easy kore bujhao',
  'গাছের খাবার তৈরি হয় কিভাবে?',
];

let turnId = 0;

function RefHelper({ question }: { question: string }) {
  const ref = useMemo(() => parseTextbookRef(question), [question]);
  if (!ref) return null;
  return (
    <div
      className="pg-card pg-card-yellow-shadow"
      style={{ padding: 14, marginBottom: 12, background: '#FFFBEB' }}
    >
      <div style={{ fontWeight: 800, marginBottom: 4 }}>I found your book part: {ref.label}</div>
      <p style={{ margin: '0 0 10px', color: '#475569', fontSize: 14 }}>
        {ref.isMatchRequests
          ? 'This is the request matching task. You can read the answer below or play it as a game.'
          : 'Nice. You wrote Unit, Lesson and Page together. That helps me find the exact answer.'}
      </p>
      {ref.isMatchRequests && (
        <Link to={MATCH_REQUESTS_PATH} className="pg-btn-secondary" style={{ textDecoration: 'none', minHeight: 44 }}>
          Play the matching game
        </Link>
      )}
    </div>
  );
}

/** Child friendly tutor workspace: guest or authenticated text chat. */
export function TutorPage() {
  const subject = useTutorStore((s) => s.subject);
  const bookId = useTutorStore((s) => s.bookId);
  const setSubject = useTutorStore((s) => s.setSubject);
  const setBookId = useTutorStore((s) => s.setBookId);
  const bumpGuestUsed = useTutorStore((s) => s.bumpGuestUsed);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const authed = useAuthStore((s) => s.status === 'authenticated' && !!s.user);

  useEffect(() => {
    listBooks().then(setBooks).catch(() => setBooks([]));
  }, []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    const id = ++turnId;
    setTurns((t) => [...t, { id, question, pending: true }]);
    setInput('');
    setSending(true);
    try {
      const lang = getLanguagePreference();
      const response = authed
        ? await tutorChat(question, { language: lang === 'banglish' ? 'auto' : lang, subject: subject || undefined, bookId: bookId || undefined })
        : await guestChat(question, { language: lang === 'banglish' ? 'auto' : lang, subject: subject || undefined, bookId: bookId || undefined });
      if (!authed) bumpGuestUsed();
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, response, pending: false } : turn)));
    } catch (error) {
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, error: getErrorMessage(error), pending: false } : turn)));
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const vote = (id: number, helpful: boolean) => {
    setTurns((t) => t.map((turn) => {
      if (turn.id !== id || !turn.response || turn.feedback) return turn;
      void sendTutorFeedback(turn.response.requestId, helpful);
      return { ...turn, feedback: helpful ? 'up' : 'down' };
    }));
  };

  const buildQuiz = async (id: number, topic: string) => {
    setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, quizPending: true, quizTried: true } : turn)));
    try {
      const lang = getLanguagePreference();
      const made = await makeTutorQuiz(topic, {
        language: lang === 'banglish' ? 'auto' : lang,
        subject: subject || undefined,
        bookId: bookId || undefined,
      });
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, quiz: made, quizPending: false } : turn)));
    } catch {
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, quiz: null, quizPending: false } : turn)));
    }
  };

  return (
    <div className="pg-app" style={{ paddingBottom: 120 }}>
      <div className="pg-container" style={{ maxWidth: 780, paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <h1 style={{ fontSize: 26 }}>Shikhi Bondhu <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>Class 3 English Friend</span></h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!authed && <Link to="/welcome" className="pg-badge pg-badge-yellow" style={{ textDecoration: 'none' }}>Guest mode</Link>}
            {authed && <Link to="/chat" className="pg-badge pg-badge-mint" style={{ textDecoration: 'none' }}>Chat with history</Link>}
            <Link to={MATCH_REQUESTS_PATH} className="pg-badge pg-badge-pink" style={{ textDecoration: 'none' }}>Matching game</Link>
            <Link to="/practice" className="pg-badge pg-badge-yellow" style={{ textDecoration: 'none' }}>Practice</Link>
          </div>
        </div>

        <div className="pg-card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>How to ask in 3 steps</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="pg-badge pg-badge-mint">1. Write Unit</span>
            <span className="pg-badge pg-badge-pink">2. Add Lesson and Page</span>
            <span className="pg-badge pg-badge-yellow">3. Add Activity</span>
          </div>
          <p style={{ margin: '0 0 10px', color: '#475569', fontSize: 14.5 }}>Example: Unit 3, Lesson 5, Page 45, Match the requests.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="pg-input" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Pick subject" style={{ minWidth: 140 }}>
              <option value="">All subjects</option>
              {Array.from(new Set(books.map((b) => b.subject))).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="pg-input" value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Pick book" style={{ minWidth: 160 }}>
              <option value="">All books</option>
              {books.filter((b) => !subject || b.subject === subject).map((b) => (
                <option key={b._id} value={b._id}>{b.title}</option>
              ))}
            </select>
          </div>
          {!authed && (
            <p style={{ marginTop: 10, fontSize: 12.5, color: '#64748B' }}>
              Guest mode allows text questions only. <Link to="/welcome">Log in</Link> for photos and saved history.
            </p>
          )}
        </div>

        {turns.length === 0 && (
          <div className="pg-card pg-card-yellow-shadow" style={{ padding: 22, textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 44 }} aria-hidden="true">📖</div>
            <h2 style={{ fontSize: 20, margin: '8px 0' }}>What will you learn today</h2>
            <p style={{ color: '#64748B', marginBottom: 12 }}>Tap one below. Bangla or Banglish is fine. Answer comes in easy Bangla.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              {EXAMPLES.map((ex) => (
                <button key={ex} className="pg-btn-secondary" style={{ fontSize: 13, padding: '8px 16px', minHeight: 40, width: 'auto' }} onClick={() => void send(ex)} disabled={sending}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {turns.map((turn) => (
            <div key={turn.id}>
              <div className="pg-card" style={{ padding: 14, background: '#F1F5F9' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>You wrote:</div>
                <div style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>{turn.question}</div>
              </div>
              <div className="pg-card pg-card-mint-shadow" style={{ padding: 18, marginTop: 10 }}>
                {turn.pending && <p style={{ color: '#64748B' }}>Friend is thinking...</p>}
                {turn.error && <p style={{ color: '#DC2626' }}>{turn.error}</p>}
                {turn.response && (
                  <>
                    <RefHelper question={turn.question} />
                    <MarkdownRenderer content={turn.response.answer} />
                    {turn.response.answerStatus === 'INSUFFICIENT_BOOK_CONTEXT' && (
                      <div className="pg-card" style={{ padding: 12, marginTop: 10, background: '#FFFBEB' }}>
                        <p className="pg-badge pg-badge-yellow" style={{ marginBottom: 8 }}>General help, not found in book</p>
                        <p style={{ margin: '8px 0', fontSize: 14, color: '#475569' }}>
                          Tip: write Unit, Lesson, Page and Activity together. Or paste the full question text for a perfect check.
                        </p>
                        <Link to={MATCH_REQUESTS_PATH} className="pg-btn-secondary" style={{ textDecoration: 'none', minHeight: 44, width: 'auto' }}>
                          Try the matching game
                        </Link>
                      </div>
                    )}
                    {turn.response.sources.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #E2E8F0' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#64748B', marginBottom: 6 }}>Book source</div>
                        {turn.response.sources.map((s) => (
                          <div key={s.chunkId} style={{ fontSize: 14, marginBottom: 4 }}>
                            Book: {s.bookTitle}
                            {s.chapterTitle ? `, Chapter: ${s.chapterTitle}` : ''}
                            {s.pageStart ? `, Page ${s.pageStart}${s.pageEnd && s.pageEnd !== s.pageStart ? ` to ${s.pageEnd}` : ''}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                    {turn.response.quiz && <QuizCard quiz={turn.response.quiz} sources={turn.response.sources} />}
                    {turn.response.followUpQuestion && (
                      <p className="text-sm" style={{ marginTop: 10 }}>Now you try. {turn.response.followUpQuestion}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '2px solid #E2E8F0', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 700 }}>Did this help</span>
                      <button
                        className="pg-btn-secondary"
                        style={{ minHeight: 38, padding: '6px 14px', fontSize: 13, width: 'auto' }}
                        aria-label="It helped"
                        disabled={!turn.response || !!turn.feedback}
                        onClick={() => vote(turn.id, true)}
                      >
                        {turn.feedback === 'up' ? 'Thanks' : 'Yes'}
                      </button>
                      <button
                        className="pg-btn-secondary"
                        style={{ minHeight: 38, padding: '6px 14px', fontSize: 13, width: 'auto', opacity: turn.feedback === 'up' ? 0.45 : 1 }}
                        aria-label="It did not help"
                        disabled={!turn.response || !!turn.feedback}
                        onClick={() => vote(turn.id, false)}
                      >
                        {turn.feedback === 'down' ? 'Sorry' : 'Not yet'}
                      </button>
                      {authed && !turn.quiz && !turn.quizPending && (
                        <button className="pg-btn-secondary" style={{ minHeight: 38, padding: '6px 14px', fontSize: 13, width: 'auto' }} onClick={() => void buildQuiz(turn.id, turn.question)}>
                          Make practice question
                        </button>
                      )}
                      {turn.quizPending && <span style={{ fontSize: 12.5, color: '#64748B' }}>Making question...</span>}
                    </div>
                    {turn.quiz && <QuizCard quiz={turn.quiz.quiz} sources={turn.quiz.sources} />}
                    {turn.quizTried && !turn.quizPending && !turn.quiz && (
                      <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 8 }}>No question ready for this yet. Try another topic from your book.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#FFFFFF', borderTop: '2px solid #1E293B', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 760, margin: '0 auto' }}>
            <input
              className="pg-input"
              style={{ flex: 1 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Write here... Try: Unit 3, Lesson 5, Page 45"
              aria-label="Write your question"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <button className="pg-btn-candy" style={{ width: 'auto' }} onClick={() => void send(input)} disabled={sending || !input.trim()}>
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
