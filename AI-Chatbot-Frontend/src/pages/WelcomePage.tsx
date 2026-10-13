import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { useTutorStore } from '@/store/tutor.store';

/** Welcome: email login options plus Continue as Guest (rate limited text chat only). */
export function WelcomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setGuest = useTutorStore((s) => s.setGuest);

  const continueAsGuest = () => {
    setGuest(true);
    navigate('/tutor');
  };

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 580, paddingTop: 48, textAlign: 'center' }}>
        <div className="pg-card pg-card-yellow-shadow" style={{ padding: 32 }}>
          <div style={{ fontSize: 52 }} aria-hidden="true">Open book</div>
          <h1 style={{ fontSize: 30, margin: '12px 0 8px' }}>Welcome to Shikhi Bondhu</h1>
          <p style={{ color: '#64748B', marginBottom: 24 }}>
            Learn easy lessons from your Class 3 book, with pictures and fun.
            {user ? ` (You are logged in as ${user.name})` : ' Log in or try as a guest.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!user && (
              <>
                <button className="pg-btn-candy" onClick={() => navigate('/login')}>Log in with email</button>
                <button className="pg-btn-secondary" onClick={() => navigate('/register')}>Make a new account</button>
                <button className="pg-btn-secondary" onClick={continueAsGuest}>Continue as guest</button>
                <p style={{ fontSize: 12.5, color: '#64748B' }}>
                  As a guest you can ask text questions only. Log in for photos, voice, saved history and progress.
                </p>
              </>
            )}
            {user && (
              <>
                <button className="pg-btn-candy" onClick={() => navigate('/tutor')}>Start learning</button>
                <button className="pg-btn-secondary" onClick={() => navigate('/books')}>See book list</button>
              </>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 24, marginBottom: 0 }}>
            This helps with study. It does not replace parents or teachers. We keep very little data.
          </p>
        </div>
      </div>
    </div>
  );
}
