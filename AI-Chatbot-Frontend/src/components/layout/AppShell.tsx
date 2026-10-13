import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  MdAdd,
  MdDelete,
  MdLogout,
  MdMenu,
  MdSettings,
  MdClose,
} from 'react-icons/md';
import { useAuthStore, useQuota } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { formatTokens } from '@/lib/format';
import { ThemeLangControls } from '@/components/ui/ThemeLangControls';

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const conversations = useChatStore((s) => s.conversations);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const clearAll = useChatStore((s) => s.clearAll);
  const createConversation = useChatStore((s) => s.createConversation);
  const { quota } = useQuota();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock body scroll + close on Escape while the mobile drawer is open.
  useEffect(() => {
    document.body.classList.toggle('drawer-open', sidebarOpen);
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const handleNewChat = async () => {
    const conversation = await createConversation('New chat');
    setSidebarOpen(false);
    navigate(`/chat/${conversation._id}`);
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete all conversations? This cannot be undone.')) return;
    await clearAll();
    navigate('/chat');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const quotaPct =
    quota && quota.daily.limit > 0
      ? Math.min(100, Math.round((quota.daily.used / quota.daily.limit) * 100))
      : 0;

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
      <div style={{ padding: 14 }}>
        <Button className="w-full" onClick={() => void handleNewChat()}>
          <MdAdd size={18} /> New chat
        </Button>
      </div>

      <div className="flex items-center gap-2" style={{ padding: '0 16px 8px' }}>
        <input
          className="input"
          placeholder="Search conversations…"
          onChange={(e) => void loadConversations(e.target.value || undefined)}
        />
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin" style={{ padding: '0 8px 8px', minHeight: 0 }}>
        {conversations.length === 0 ? (
          <p className="text-sm text-muted text-center" style={{ padding: 20 }}>
            No conversations yet.
          </p>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation._id}
              className="flex items-center justify-between rounded conversation-item"
              style={{
                padding: '9px 10px',
                cursor: 'pointer',
                gap: 8,
                background: window.location.pathname.includes(conversation._id)
                  ? 'var(--bg-active)'
                  : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!window.location.pathname.includes(conversation._id)) {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!window.location.pathname.includes(conversation._id)) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <button
                className="flex-1 text-left ellipsis"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 14 }}
                onClick={() => {
                  navigate(`/chat/${conversation._id}`);
                  setSidebarOpen(false);
                }}
                title={conversation.title}
              >
                {conversation.pinned ? '📌 ' : ''}
                {conversation.title || 'Untitled chat'}
              </button>
              <button
                className="btn btn-ghost btn-icon"
                style={{ padding: 4, opacity: 0.6 }}
                title="Delete"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Delete "${conversation.title}"?`)) return;
                  await deleteConversation(conversation._id);
                }}
              >
                <MdDelete size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {quota && quota.daily.limit > 0 && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-color)' }}>
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>Daily tokens</span>
            <span>
              {formatTokens(quota.daily.used)} / {formatTokens(quota.daily.limit)}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${quotaPct}%`,
                background: quotaPct >= 90 ? 'var(--color-danger)' : 'var(--color-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2" style={{ padding: 12, borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <Avatar name={user?.name} size="sm" />
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="text-sm font-semibold ellipsis">{user?.name}</div>
          <div className="text-xs text-muted ellipsis">{user?.email}</div>
        </div>
        <ThemeLangControls compact />
        {user?.role === 'admin' && (
          <button
            className="btn btn-ghost btn-icon"
            title="Admin panel"
            onClick={() => navigate('/admin')}
          >
            <MdSettings size={17} />
          </button>
        )}
        <button className="btn btn-ghost btn-icon" title="Logout" onClick={() => void handleLogout()}>
          <MdLogout size={17} />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex app-height" style={{ overflow: 'hidden' }}>
      {/* Desktop sidebar (>= 1024px) */}
      <div style={{ display: 'none', height: '100%', width: 272, flexShrink: 0 }} className="sidebar-desktop">
        {sidebar}
      </div>

      {/* Mobile drawer: slides in from the left with overlay */}
      {sidebarOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setSidebarOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Conversation menu">
            <div className="drawer-head">
              <span className="font-semibold" style={{ fontSize: 15 }}>NoticeFlow</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                <MdClose size={20} />
              </button>
            </div>
            {sidebar}
          </div>
        </>
      )}

      {/* Main column: topbar + chat content */}
      <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
        <div
          className="flex items-center justify-between"
          style={{
            height: 52,
            padding: '0 14px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexShrink: 0,
          }}
        >
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <button className="btn btn-ghost btn-icon sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <MdMenu size={20} />
            </button>
            <span className="font-semibold ellipsis" style={{ fontSize: 15 }}>
              Shikhi Bondhu
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeLangControls compact />
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--text-muted)', flexShrink: 0 }}
              onClick={() => void handleClearAll()}
            >
              <MdDelete size={15} /> Clear all
            </button>
          </div>
        </div>
        <div className="flex-1 route-fade" style={{ minHeight: 0, position: 'relative', overflow: 'hidden', background: 'var(--bg-chat)' }}>
          <Outlet />
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .sidebar-desktop { display: block !important; }
          .sidebar-toggle { display: none; }
        }
      `}</style>
    </div>
  );
}
