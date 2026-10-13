import { useNavigate } from 'react-router-dom';
import { MdArrowForward } from 'react-icons/md';

const BADGES = ['Class 3 book based', 'Understands Bangla and Banglish', 'Teaches in easy steps', 'Safe and caring'];

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="pg-app" aria-labelledby="landing-hero-title" style={{ position: 'relative', overflow: 'hidden', padding: '72px 0 64px' }}>
      <div className="pg-dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.6 }} aria-hidden="true" />
      <div aria-hidden="true" style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: '#FBBF24', opacity: 0.35, left: -140, top: -80 }} />
      <div aria-hidden="true" style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: '#F472B6', opacity: 0.25, right: 60, top: 40 }} />
      <div aria-hidden="true" style={{ position: 'absolute', width: 90, height: 90, borderRadius: 24, background: '#34D399', opacity: 0.3, right: 160, bottom: 30, transform: 'rotate(14deg)' }} />
      <div className="pg-container" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 32, alignItems: 'center' }}>
        <div>
          <span className="pg-badge pg-badge-yellow" style={{ marginBottom: 14, display: 'inline-flex' }}>Shikhi Bondhu, Class 3 English Friend</span>
          <h1 id="landing-hero-title" style={{ fontSize: 48, lineHeight: 1.05, marginBottom: 14 }}>
            Learn from your book, <span style={{ background: '#FBBF24', padding: '0 10px', borderRadius: 12, border: '2px solid #1E293B' }}>with joy</span> in easy Bangla
          </h1>
          <p style={{ fontSize: 18, color: '#475569', marginBottom: 22, maxWidth: 520 }}>
            Your Class 3 study friend for English For Today. Ask with Unit, Lesson and Page number, get matching answers in simple words.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <button className="pg-btn-candy" onClick={() => navigate('/tutor')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: 'white', color: '#8B5CF6' }}>
                <MdArrowForward size={18} />
              </span>
              Start learning
            </button>
            <button className="pg-btn-secondary" onClick={() => navigate('/exercise/match-requests')}>
              Play matching game
            </button>
          </div>
          <ul style={{ display: 'flex', gap: 8, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
            {BADGES.map((label, i) => (
              <li key={label} className={i % 2 === 0 ? 'pg-badge pg-badge-mint' : 'pg-badge pg-badge-pink'}>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="pg-card pg-card-pink-shadow pg-pop-in" style={{ padding: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Try this now</div>
          <div className="pg-result-bubble" style={{ marginBottom: 10 }}>
            <span className="pg-result-icon">1</span>
            <div style={{ fontWeight: 700 }}>Unit 3, Lesson 5, Page 45, Match the requests</div>
          </div>
          <div className="pg-result-bubble correct">
            <span className="pg-result-icon">OK</span>
            <div>All 5 matches solved with Bangla meaning. No photo needed.</div>
          </div>
          <button className="pg-btn-candy" style={{ marginTop: 16, width: '100%' }} onClick={() => navigate('/tutor')}>
            Ask Shikhi Bondhu
          </button>
        </div>
      </div>
    </section>
  );
}

