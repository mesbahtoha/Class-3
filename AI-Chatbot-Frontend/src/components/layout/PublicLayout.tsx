import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FaRobot, FaFacebook, FaYoutube, FaEnvelope, FaPhone, FaMapMarkerAlt } from 'react-icons/fa';
import { MdMenu, MdClose, MdExpandMore, MdDashboard, MdChat, MdLogout, MdPerson } from 'react-icons/md';
import { useAuthStore } from '@/store/auth.store';
import { useEffect, useRef, useState } from 'react';
import { ThemeLangControls } from '@/components/ui/ThemeLangControls';
import { useLang } from '@/lib/i18n';

export function PublicLayout() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { t, lang } = useLang();
  const authed = status === 'authenticated' && !!user;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setProfileOpen(false); }
    };
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, []);

  const close = () => setMenuOpen(false);
  const go = (path: string) => { close(); setProfileOpen(false); navigate(path); };
  const doLogout = async () => { setProfileOpen(false); close(); await logout(); navigate('/'); };

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    padding: '8px 13px', borderRadius: 999, fontWeight: 700 as const, fontSize: 13.5,
    color: isActive ? '#fff' : '#1E293B', background: isActive ? '#1E293B' : 'transparent',
    textDecoration: 'none' as const,
  });

  return (
    <div className="pg-app flex flex-col" style={{ minHeight: '100vh' }}>
      <header className="public-header sticky-header flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 brand-link" onClick={close}>
          <span className="brand-badge"><FaRobot size={18} /></span>
          <span className="brand-name">Shikhi Bondhu</span>
        </Link>

        <nav className="public-nav-desktop" aria-label="Primary">
          <NavLink to="/" style={linkStyle} end>{t('nav.home')}</NavLink>
          <NavLink to="/tutor" style={linkStyle}>{t('nav.tutor')}</NavLink>
          <NavLink to="/practice" style={linkStyle}>{t('nav.practice')}</NavLink>
          <NavLink to="/books" style={linkStyle}>{t('nav.books')}</NavLink>
          <NavLink to="/about" style={linkStyle}>{t('nav.about')}</NavLink>
          <NavLink to="/contact" style={linkStyle}>{t('nav.contact')}</NavLink>
          {authed && <NavLink to="/chat" style={linkStyle}>{t('nav.chat')}</NavLink>}
          {authed && user?.role === 'admin' && <NavLink to="/admin" style={linkStyle}>{t('nav.dashboard')}</NavLink>}
        </nav>

        <div className="public-header-actions">
          <div className="hide-sm"><ThemeLangControls compact /></div>
          {!authed ? (
            <div className="hide-sm flex items-center gap-2">
              <button className="pg-btn-secondary header-btn" onClick={() => go('/login')}>{t('nav.login')}</button>
              <button className="pg-btn-candy header-btn" onClick={() => go('/register')}>{t('nav.getStarted')}</button>
            </div>
          ) : (
            <div className="hide-sm profile-wrap" ref={profileRef}>
              <button className="profile-btn" onClick={() => setProfileOpen((o) => !o)} aria-haspopup="menu" aria-expanded={profileOpen}>
                <span className="profile-avatar">{(user?.name || 'S').slice(0, 1).toUpperCase()}</span>
                <span className="profile-name">{user?.name}</span>
                <MdExpandMore size={16} />
              </button>
              {profileOpen && (
                <div className="profile-menu" role="menu">
                  <div className="profile-menu-head">
                    <strong>{user?.name}</strong>
                    <span>{user?.email}</span>
                  </div>
                  <button role="menuitem" onClick={() => go('/chat')}><MdChat size={15} /> {t('nav.chat')}</button>
                  {user?.role === 'admin'
                    ? <button role="menuitem" onClick={() => go('/admin')}><MdDashboard size={15} /> {t('nav.dashboard')}</button>
                    : <button role="menuitem" onClick={() => go('/welcome')}><MdPerson size={15} /> {t('nav.profile')}</button>}
                  <button role="menuitem" onClick={() => go('/help')}><MdPerson size={15} /> {t('nav.help')}</button>
                  <button role="menuitem" className="danger" onClick={() => void doLogout()}><MdLogout size={15} /> {t('nav.logout')}</button>
                </div>
              )}
            </div>
          )}
          <button
            className="btn btn-ghost btn-icon public-nav-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? t('nav.close') : t('nav.menu')}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <MdClose size={20} /> : <MdMenu size={22} />}
          </button>
        </div>

        <div className={`public-mobile-menu${menuOpen ? ' open' : ''}`}>
          <div className="mobile-toggles"><ThemeLangControls compact /></div>
          <Link to="/" className="nav-link" onClick={close}>{t('nav.home')}</Link>
          <Link to="/tutor" className="nav-link" onClick={close}>{t('nav.tutor')}</Link>
          <Link to="/practice" className="nav-link" onClick={close}>{t('nav.practice')}</Link>
          <Link to="/books" className="nav-link" onClick={close}>{t('nav.books')}</Link>
          <Link to="/exercise/match-requests" className="nav-link" onClick={close}>{t('nav.game')}</Link>
          <Link to="/about" className="nav-link" onClick={close}>{t('nav.about')}</Link>
          <Link to="/contact" className="nav-link" onClick={close}>{t('nav.contact')}</Link>
          <Link to="/help" className="nav-link" onClick={close}>{t('nav.help')}</Link>
          {authed && <Link to="/chat" className="nav-link" onClick={close}>{t('nav.chat')}</Link>}
          {authed && user?.role === 'admin' && <Link to="/admin" className="nav-link" onClick={close}>{t('nav.dashboard')}</Link>}
          <div className="mobile-menu-divider" />
          {!authed ? (
            <>
              <Link to="/login" className="nav-link" onClick={close}>{t('nav.login')}</Link>
              <button className="pg-btn-candy" style={{ minHeight: 46 }} onClick={() => go('/register')}>{t('nav.getStarted')}</button>
            </>
          ) : (
            <>
              <div className="mobile-user">{user?.name} ({user?.email})</div>
              <button className="pg-btn-secondary" style={{ minHeight: 46 }} onClick={() => void doLogout()}>{t('nav.logout')}</button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 route-fade">
        <Outlet key={lang} />
      </main>

      <footer className="site-footer">
        <div className="pg-container footer-grid">
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <span className="brand-badge" style={{ width: 34, height: 34 }}><FaRobot size={15} /></span>
              <strong style={{ fontFamily: 'Outfit, sans-serif' }}>Shikhi Bondhu</strong>
            </div>
            <p>{t('footer.tag')}</p>
            <p className="footer-small">{t('footer.made')}</p>
            <div className="social-row">
              <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook"><FaFacebook /></a>
              <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube"><FaYoutube /></a>
              <a href="mailto:hello@shikhibondhu.app" aria-label="Email"><FaEnvelope /></a>
            </div>
          </div>
          <div>
            <h4>{t('footer.explore')}</h4>
            <Link to="/">{t('nav.home')}</Link>
            <Link to="/tutor">{t('nav.tutor')}</Link>
            <Link to="/practice">{t('nav.practice')}</Link>
            <Link to="/books">{t('nav.books')}</Link>
            <Link to="/exercise/match-requests">{t('nav.game')}</Link>
          </div>
          <div>
            <h4>{t('footer.support')}</h4>
            <Link to="/about">{t('nav.about')}</Link>
            <Link to="/contact">{t('nav.contact')}</Link>
            <Link to="/help">{t('nav.help')}</Link>
            <Link to="/privacy">{t('nav.privacy')}</Link>
            {!authed && <Link to="/login">{t('nav.login')}</Link>}
          </div>
          <div>
            <h4>{t('footer.contact')}</h4>
            <span><FaEnvelope size={12} /> hello@shikhibondhu.app</span>
            <span><FaPhone size={12} /> +880 1XXX XXXXXX</span>
            <span><FaMapMarkerAlt size={12} /> Dhaka, Bangladesh</span>
          </div>
        </div>
        <div className="footer-bottom">© 2026 Shikhi Bondhu. {t('footer.rights')}</div>
      </footer>
    </div>
  );
}
