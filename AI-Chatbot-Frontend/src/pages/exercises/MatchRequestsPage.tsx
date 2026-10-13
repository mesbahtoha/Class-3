import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaArrowDown,
  FaArrowLeft,
  FaCheck,
  FaComments,
  FaGift,
  FaHandPointer,
  FaLightbulb,
  FaRedo,
  FaStar,
} from 'react-icons/fa';
import './MatchRequestsPage.css';

/* ------------------------------------------------------------------ */
/* Exercise data: English For Today, Unit 3, Lesson 5, Page 45, Activity C */
/* ------------------------------------------------------------------ */

type RequestItem = {
  id: string;
  label: string;
  text: string;
  bn: string;
  hint: string;
  emoji: string;
  responseId: string;
};

type ResponseItem = {
  id: string;
  label: string;
  text: string;
  emoji: string;
};

const REQUESTS: RequestItem[] = [
  {
    id: 'r1',
    label: 'A1',
    text: 'Could you please call me this evening?',
    bn: 'তুমি কি সন্ধ্যায় আমাকে ফোন করতে পারবে?',
    hint: 'Someone wants a phone call tonight.',
    emoji: '📞',
    responseId: 'b1',
  },
  {
    id: 'r2',
    label: 'A2',
    text: 'Can you repeat that, please?',
    bn: 'তুমি কি এটা আবার বলতে পারবে?',
    hint: 'You did not hear it. Ask for it again!',
    emoji: '🔁',
    responseId: 'b2',
  },
  {
    id: 'r3',
    label: 'A3',
    text: 'Could I have a look at your newspaper?',
    bn: 'আমি কি তোমার পত্রিকাটি দেখতে পারি?',
    hint: 'A friend wants your newspaper, but you are reading it.',
    emoji: '📰',
    responseId: 'b3',
  },
  {
    id: 'r4',
    label: 'A4',
    text: 'Can I borrow your pen, please?',
    bn: 'আমি কি তোমার কলমটি ধার নিতে পারি?',
    hint: 'A friend needs a pen, but you have only one.',
    emoji: '🖊️',
    responseId: 'b4',
  },
  {
    id: 'r5',
    label: 'A5',
    text: 'Can we meet at the library?',
    bn: 'আমরা কি লাইব্রেরিতে দেখা করতে পারি?',
    hint: 'A friend wants to see you at the library.',
    emoji: '📚',
    responseId: 'b5',
  },
];

const ALL_RESPONSES: ResponseItem[] = [
  { id: 'b1', label: 'B1', text: 'Of course. I will call you around 6:00.', emoji: '⏰' },
  { id: 'b2', label: 'B2', text: 'Sure. I am saying it again.', emoji: '🗣️' },
  { id: 'b3', label: 'B3', text: 'Sorry, but I am reading it now.', emoji: '📖' },
  { id: 'b4', label: 'B4', text: 'Sorry. I have only one pen.', emoji: '✏️' },
  { id: 'b5', label: 'B5', text: 'Yes, please. I will see you at the library.', emoji: '🏫' },
];

/* B1 is the "one done for you". It stays matched from the start. */
const BANK_RESPONSES = ALL_RESPONSES.filter((r) => r.id !== 'b1');

const CONFETTI_COLORS = ['#8B5CF6', '#F472B6', '#FBBF24', '#34D399'];

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* Celebration confetti                                                */
/* ------------------------------------------------------------------ */

function ConfettiField({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 8 + Math.random() * 12,
        delay: Math.random() * 1.6,
        duration: 2.8 + Math.random() * 1.8,
        drift: -50 + Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        shape: i % 4,
      })),
    [count]
  );

  return (
    <div className="pg-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`pg-confetti-piece pg-confetti-piece--${['circle', 'square', 'triangle', 'leaf'][p.shape]}`}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderBottomColor: p.color,
            borderLeftWidth: p.size / 2,
            borderRightWidth: p.size / 2,
            borderBottomWidth: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */

export function MatchRequestsPage() {
  /* r1 is pre-matched: "One is done for you." */
  const [matches, setMatches] = useState<Record<string, string>>({ r1: 'b1' });
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [wrongResponse, setWrongResponse] = useState<string | null>(null);
  const [shownHints, setShownHints] = useState<Record<string, boolean>>({});
  const [tip, setTip] = useState('');
  const [finished, setFinished] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const matchedCount = Object.keys(matches).length;
  const remaining = BANK_RESPONSES.filter(
    (r) => !Object.values(matches).includes(r.id)
  ).length;

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(''), 2400);
  };

  const handleRequestClick = (id: string) => {
    if (matches[id]) return;
    setSelectedRequest(id);
    showTip('Great! Now tap the matching reply in the bank.');
  };

  const handleResponseClick = (responseId: string) => {
    if (!selectedRequest) {
      showTip('First tap a request card on the left!');
      return;
    }
    const request = REQUESTS.find((r) => r.id === selectedRequest);
    if (!request) return;

    if (request.responseId === responseId) {
      const next = { ...matches, [request.id]: responseId };
      setMatches(next);
      setSelectedRequest(null);
      if (Object.keys(next).length === REQUESTS.length) {
        window.setTimeout(() => setFinished(true), 700);
      } else {
        showTip('Awesome! You matched one more!');
      }
    } else {
      setWrongResponse(responseId);
      showTip('Oops! That reply does not fit. Try another one!');
      window.setTimeout(() => setWrongResponse(null), 500);
    }
  };

  const toggleHint = (id: string) => {
    setShownHints((h) => ({ ...h, [id]: !h[id] }));
  };

  const revealAnswers = () => {
    const all: Record<string, string> = {};
    REQUESTS.forEach((r) => {
      all[r.id] = r.responseId;
    });
    setMatches(all);
    setRevealed(true);
    setSelectedRequest(null);
  };

  const reset = () => {
    setMatches({ r1: 'b1' });
    setSelectedRequest(null);
    setShownHints({});
    setFinished(false);
    setRevealed(false);
    setTip('');
  };

  return (
    <div className="playful">
      <div className="pg-wrap">
        {/* ---------- Top bar ---------- */}
        <header className="pg-topbar">
          <Link to="/" className="pg-brand">
            <span className="pg-brand-badge">📘</span>
            English For Today
          </Link>
          <Link to="/practice" className="pg-back-btn">
            <FaArrowLeft /> Back to Practice
          </Link>
        </header>

        {/* ---------- Hero ---------- */}
        <section className="pg-hero">
          <div className="pg-hero-decor" aria-hidden="true">
            <span className="pg-circle-yellow" />
            <span className="pg-dotpatch" />
            <span className="pg-shape pg-shape-circle" />
            <span className="pg-shape pg-shape-square" />
            <span className="pg-shape pg-shape-pill" />
            <span className="pg-shape pg-shape-triangle" />
          </div>

          <div className="pg-badges">
            <span className="pg-badge pg-badge--violet">Unit 3</span>
            <span className="pg-badge pg-badge--pink">Lesson 5</span>
            <span className="pg-badge pg-badge--yellow">Page 45</span>
            <span className="pg-badge pg-badge--mint">Activity C</span>
          </div>

          <h1 className="pg-title">
            Match the <span className="pg-title-accent">Requests</span>
          </h1>
          <svg
            className="pg-squiggle"
            viewBox="0 0 220 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 12 C 30 2, 50 22, 76 12 S 122 2, 148 12 S 194 22, 216 12"
              stroke="#F472B6"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </svg>
          <p className="pg-subtitle">
            Read each request and find the perfect reply. One is already done
            for you. Now match the other four!
          </p>
          <p className="pg-subtitle-bn">
            প্রতিটি অনুরোধের সাথে সঠিক উত্তরটি মিলাও। একটি ইতিমধ্যে করে দেওয়া
            আছে। এবার বাকি চারটা মেলাও!
          </p>
          <div className="pg-hero-cta">
            <a href="#game" className="pg-btn">
              Start Matching <FaArrowDown />
            </a>
            <a href="#how" className="pg-btn pg-btn--ghost">
              How to Play
            </a>
          </div>
        </section>

        {/* ---------- How to play ---------- */}
        <section className="pg-steps" id="how">
          <h2 className="pg-section-title">How to Play</h2>
          <p className="pg-section-sub">
            Three easy steps. You can do it!
          </p>
          <div className="pg-steps-grid">
            <div className="pg-step pg-step--violet">
              <span className="pg-step-num" aria-hidden="true">1</span>
              <span className="pg-step-icon"><FaHandPointer /></span>
              <h3>Pick a Request</h3>
              <p>Tap any request card you want to answer first. It will light up violet.</p>
            </div>
            <div className="pg-step pg-step--pink">
              <span className="pg-step-num" aria-hidden="true">2</span>
              <span className="pg-step-icon"><FaComments /></span>
              <h3>Find the Reply</h3>
              <p>Read the Response Bank and tap the reply that fits the request best.</p>
            </div>
            <div className="pg-step pg-step--yellow">
              <span className="pg-step-num" aria-hidden="true">3</span>
              <span className="pg-step-icon"><FaGift /></span>
              <h3>Fill the Stars</h3>
              <p>Match all five requests to fill every star. Great job, super star!</p>
            </div>
          </div>
        </section>

        {/* ---------- Game ---------- */}
        <section className="pg-game" id="game">
          <h2 className="pg-section-title">Let's Match!</h2>
          <p className="pg-section-sub">
            Tap a request, then tap the reply that fits.
          </p>

          <div className="pg-book-card">
            <span className="pg-book-emoji">📘</span>
            <div>
              <strong>English For Today, Class 3</strong>
              <span>Unit 3 · Lesson 5: Making requests · Page 45 · Activity C</span>
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="pg-progress"
            role="status"
            aria-label={`${matchedCount} of 5 requests matched`}
          >
            <div className="pg-progress-left">
              <div className="pg-stars">
                {Array.from({ length: 5 }, (_, i) => (
                  <FaStar
                    key={i}
                    className={cx('pg-star', i < matchedCount && 'pg-star--on')}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <span className="pg-progress-text">
                {matchedCount} / 5 matched
              </span>
            </div>
            <div className="pg-progress-actions">
              <button
                type="button"
                className="pg-btn pg-btn--ghost pg-btn-sm"
                onClick={revealAnswers}
              >
                <FaLightbulb /> Show Answers
              </button>
              <button
                type="button"
                className="pg-btn pg-btn--ghost pg-btn-sm"
                onClick={reset}
              >
                <FaRedo /> Try Again
              </button>
            </div>
          </div>

          {revealed && (
            <div className="pg-reveal-banner">
              <span>Answers are showing. Reset and try again to practice!</span>
              <button
                type="button"
                className="pg-btn pg-btn--mint pg-btn-sm"
                onClick={reset}
              >
                <FaRedo /> Practice Now
              </button>
            </div>
          )}

          <div className="pg-board">
            {/* Requests column */}
            <div className="pg-requests">
              {REQUESTS.map((req, index) => {
                const isMatched = Boolean(matches[req.id]);
                const isSelected = selectedRequest === req.id;
                const matchedResponse = isMatched
                  ? ALL_RESPONSES.find((r) => r.id === matches[req.id])
                  : null;
                const isGiven = req.id === 'r1';

                return (
                  <article
                    key={req.id}
                    className={cx(
                      'pg-request',
                      isMatched && 'pg-request--matched',
                      isSelected && 'pg-request--selected'
                    )}
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <div className="pg-request-head">
                      <span className="pg-request-emoji" aria-hidden="true">
                        {req.emoji}
                      </span>
                      <span className="pg-request-label">{req.label}</span>
                      {isMatched && (
                        <span
                          className={cx(
                            'pg-done-tag',
                            isGiven && 'pg-done-tag--given'
                          )}
                        >
                          {isGiven ? (
                            <>Given</>
                          ) : (
                            <>
                              <FaCheck /> Matched
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <p className="pg-request-text">{req.text}</p>
                    <p className="pg-request-bn">{req.bn}</p>

                    <div className="pg-hint-row">
                      <button
                        type="button"
                        className="pg-hint-btn"
                        onClick={() => toggleHint(req.id)}
                        aria-pressed={Boolean(shownHints[req.id])}
                      >
                        <FaLightbulb /> Hint
                      </button>
                    </div>
                    {shownHints[req.id] && (
                      <p className="pg-hint-text">{req.hint}</p>
                    )}

                    {isMatched && matchedResponse && (
                      <div className="pg-bubble">
                        <span className="pg-bubble-emoji" aria-hidden="true">
                          {matchedResponse.emoji}
                        </span>
                        <p>{matchedResponse.text}</p>
                        <span className="pg-bubble-label">
                          {matchedResponse.label}
                        </span>
                      </div>
                    )}

                    {!isMatched && (
                      <button
                        type="button"
                        className="pg-pick-btn"
                        onClick={() => handleRequestClick(req.id)}
                        aria-pressed={isSelected}
                      >
                        {isSelected
                          ? 'Now tap a reply below'
                          : 'Tap me, then tap a reply'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Response bank */}
            <aside className="pg-bank" aria-label="Response bank">
              <div className="pg-bank-head">
                <h3 className="pg-bank-title">Response Bank</h3>
                <span className="pg-bank-count">{remaining} left</span>
              </div>
              <p className="pg-bank-sub">
                Tap a reply after picking a request.
              </p>
              <div className="pg-bank-grid">
                {BANK_RESPONSES.filter(
                  (r) => !Object.values(matches).includes(r.id)
                ).map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    className={cx(
                      'pg-reply',
                      wrongResponse === res.id && 'pg-reply--wrong'
                    )}
                    onClick={() => handleResponseClick(res.id)}
                  >
                    <span className="pg-reply-emoji" aria-hidden="true">
                      {res.emoji}
                    </span>
                    <span className="pg-reply-text">{res.text}</span>
                    <span className="pg-reply-label">{res.label}</span>
                  </button>
                ))}
                {remaining === 0 && (
                  <div className="pg-bank-empty">
                    Every reply found. Amazing!
                  </div>
                )}
              </div>
            </aside>
          </div>
        </section>
      </div>

      {/* Floating tip toast */}
      {tip && (
        <div className="pg-toast" role="status" aria-live="polite">
          {tip}
        </div>
      )}

      {/* Celebration overlay */}
      {finished && (
        <div className="pg-celebration" role="dialog" aria-modal="true" aria-label="Well done">
          <ConfettiField />
          <div className="pg-celebration-card">
            <span className="pg-celebration-emoji" aria-hidden="true">🎉</span>
            <h2>You did it!</h2>
            <p>
              You matched all 5 requests with the perfect replies. You are a
              matching champion!
            </p>
            <div className="pg-stars pg-stars--big" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }, (_, i) => (
                <FaStar key={i} className="pg-star pg-star--on" aria-hidden="true" />
              ))}
            </div>
            <div className="pg-celebration-actions">
              <button type="button" className="pg-btn" onClick={reset}>
                <FaRedo /> Play Again
              </button>
              <Link to="/practice" className="pg-btn pg-btn--ghost">
                Back to Practice
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
