import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  MdChat,
  MdDashboard,
  MdLogout,
  MdMessage,
  MdPeople,
  MdSettings,
  MdStickyNote2,
  MdToken,
  MdAnalytics,
  MdListAlt,
  MdMemory,
  MdMenu,
  MdClose,
} from 'react-icons/md';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { ThemeLangControls } from '@/components/ui/ThemeLangControls';
import { Avatar } from '@/components/ui/Avatar';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: MdDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: MdPeople },
  { to: '/admin/books', label: 'Books (Class 3)', icon: MdStickyNote2 },
  { to: '/admin/ai-settings', label: 'AI Providers', icon: MdMemory },
  { to: '/admin/notices', label: 'Notices (legacy)', icon: MdStickyNote2 },
  { to: '/admin/chats', label: 'Chat History', icon: MdMessage },
  { to: '/admin/analytics', label: 'Analytics', icon: MdAnalytics },
  { to: '/admin/tokens', label: 'Token Usage', icon: MdToken },
  { to: '/admin/settings', label: 'Settings', icon: MdSettings },
  { to: '/admin/prompt-templates', label: 'Prompt Templates', icon: MdListAlt },
  { to: '/admin/logs', label: 'System Logs', icon: MdMemory },
  { to: '/admin/system', label: 'System Info', icon: MdMemory },
];

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Lock body scroll + close on Escape while the mobile drawer is open.
  useEffect(() => {
    document.body.classList.toggle('drawer-open', open);
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const sidebar = (
    <aside
      style={{
        width: '100%',
        background: 'var(--bg-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div className="flex items-center gap-2" style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
        <span style={{ color: 'var(--color-primary)', fontSize: 22 }}><MdChat /></span>
        <div>
          <div className="font-bold" style={{ fontSize: 15 }}>NoticeFlow</div>
          <div className="text-xs text-muted">Admin Panel</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scroll-thin" style={{ padding: '10px 8px', minHeight: 0 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded ${isActive ? 'font-semibold' : ''}`
            }
            style={({ isActive }) => ({
              padding: '11px 12px',
              fontSize: 14,
              color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-active)' : 'transparent',
              marginBottom: 2,
            })}
            onClick={() => setOpen(false)}
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: 12, borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
        <NavLink
          to="/chat"
          className="flex items-center gap-2"
          style={{ padding: '8px 10px', fontSize: 13.5, color: 'var(--text-secondary)', borderRadius: 8 }}
          onClick={() => setOpen(false)}
        >
          <MdChat size={16} /> Back to chat app
        </NavLink>
      </div>

      <div className="flex items-center gap-2" style={{ padding: 12, borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <Avatar name={user?.name} size="sm" />
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="text-sm font-semibold ellipsis">{user?.name}</div>
          <div className="text-xs text-muted ellipsis">{user?.email}</div>
        </div>
        <ThemeLangControls compact />
        <button className="btn btn-ghost btn-icon" title="Logout" onClick={() => void handleLogout()}>
          <MdLogout size={17} />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex app-height" style={{ overflow: 'hidden' }}>
      {/* Desktop sidebar (>= 1024px) */}
      <div style={{ display: 'none', height: '100%', width: 236, flexShrink: 0 }} className="admin-sidebar-desktop">
        {sidebar}
      </div>

      {/* Mobile drawer: slides in from the left with overlay */}
      {open && (
        <>
          <div className="drawer-overlay" onClick={() => setOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Admin menu">
            <div className="drawer-head">
              <span className="font-semibold" style={{ fontSize: 15 }}>Admin</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <MdClose size={20} />
              </button>
            </div>
            {sidebar}
          </div>
        </>
      )}

      <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
        <div
          className="flex items-center justify-between"
          style={{
            height: 52,
            padding: '0 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-icon admin-sidebar-toggle" onClick={() => setOpen(true)} aria-label="Open menu">
              <MdMenu size={20} />
            </button>
            <span className="font-semibold" style={{ fontSize: 15 }}>Shikhi Admin</span>
          </div>
          <ThemeLangControls compact />
        </div>
        <div className="flex-1 overflow-y-auto admin-content route-fade">
          <Outlet />
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .admin-sidebar-desktop { display: block !important; }
          .admin-sidebar-toggle { display: none; }
        }
      `}</style>
    </div>
  );
}
