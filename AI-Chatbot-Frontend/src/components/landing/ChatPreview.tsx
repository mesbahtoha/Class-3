import { FaRobot } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

export function ChatPreview() {
  const navigate = useNavigate();
  return (
    <section className="pg-app" aria-label="Chat preview" style={{ padding: '24px 0 48px' }}>
      <div className="pg-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'stretch' }}>
        <div className="pg-card pg-card-yellow-shadow" style={{ padding: 22 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>A child asks</div>
          <div className="pg-result-bubble" style={{ marginBottom: 10 }}>
            <span className="pg-result-icon">You</span>
            <div style={{ fontWeight: 700 }}>Unit 3, Lesson 5, Activity C, Match the requests, Page 45. Please solve this.</div>
          </div>
          <div className="pg-result-bubble correct">
            <span className="pg-result-icon">OK</span>
            <div>Shikhi Bondhu solves all 5 matches at once, with Bangla meaning for each line.</div>
          </div>
        </div>
        <div className="pg-card" style={{ padding: 22, background: '#F4F0FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#8B5CF6', color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #1E293B' }}>
              <FaRobot size={16} />
            </span>
            <strong>Shikhi Bondhu is online</strong>
          </div>
          <p style={{ color: '#475569', marginBottom: 16 }}>Short Unit Lesson Page text is enough. No photo needed. Tap below to try the real game.</p>
          <button className="pg-btn-candy" onClick={() => navigate('/exercise/match-requests')} style={{ width: '100%' }}>
            Open matching game
          </button>
        </div>
      </div>
    </section>
  );
}

