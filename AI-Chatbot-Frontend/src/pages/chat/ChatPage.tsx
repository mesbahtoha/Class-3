import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaRobot } from 'react-icons/fa';
import { MdDelete, MdEdit, MdLink, MdDownload, MdPushPin, MdKeyboardArrowDown } from 'react-icons/md';
import toast from 'react-hot-toast';
import { useChatStore } from '@/store/chat.store';
import { useChatSession } from '@/hooks/useChatSession';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatComposer, ComposerSendPayload } from '@/components/chat/ChatComposer';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Form';
import { ChatSkeleton } from '@/components/ui/Skeleton';
import { apiPost } from '@/lib/api';
import { API_BASE_URL } from '@/lib/api';

function EmptyChatHero() {
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: '100%', padding: '48px 24px', textAlign: 'center' }}>
      <div
        className="flex items-center justify-center"
        style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--color-primary)', color: '#fff', fontSize: 30, marginBottom: 16 }}
      >
        <FaRobot />
      </div>
      <h1 className="text-2xl font-bold" style={{ marginBottom: 8 }}>
        👋 শিখি বন্ধু, আজ কী শিখবে?
      </h1>
      <p className="text-muted" style={{ maxWidth: 480, marginBottom: 12 }}>
        বইভিত্তিক সহজ ব্যাখ্যা। বাংলায় লেখো বা Banglish এ, উত্তর পাবে বাংলা হরফে।
      </p>
      <div className="flex flex-wrap justify-center" style={{ gap: 8, maxWidth: 520 }}>
        {['ভগ্নাংশ কী? সহজ করে বোঝাও', 'vognangsho ki?', 'গাছের খাবার তৈরি হয় কিভাবে?'].map((ex) => (
          <span key={ex} className="badge" style={{ fontSize: 12.5 }}>{ex}</span>
        ))}
      </div>
    </div>
  );
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const current = useChatStore((s) => s.current);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const loadConversation = useChatStore((s) => s.loadConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const [loading, setLoading] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const session = useChatSession(id ?? '');

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setShowScrollBtn(false);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = nearBottom;
    setShowScrollBtn(!nearBottom);
  };

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    loadConversation(id)
      .catch(() => {
        if (active) navigate('/chat', { replace: true });
      })
      .finally(() => active && setLoading(false));
    void loadConversations();
    return () => {
      active = false;
    };
  }, [id, loadConversation, loadConversations, navigate]);

  // The conversation for this URL no longer exists (deleted from the
  // sidebar or removed elsewhere): fall back to the resume/create flow
  // without any error message.
  useEffect(() => {
    if (!id || loading || current) return;
    navigate('/chat', { replace: true });
  }, [id, loading, current, navigate]);

  // No conversation selected: resume the most recent chat, or open a fresh
  // new chat for new users so the input box is always visible.
  useEffect(() => {
    if (id) return;
    let active = true;
    void loadConversations().then(async () => {
      if (!active) return;
      const latest = useChatStore.getState().conversations[0];
      if (latest) {
        navigate(`/chat/${latest._id}`, { replace: true });
      } else {
        try {
          const conversation = await createConversation('New chat');
          if (active) navigate(`/chat/${conversation._id}`, { replace: true });
        } catch {
          if (active) navigate('/chat', { replace: true });
        }
      }
    });
    return () => {
      active = false;
    };
  }, [id, loadConversations, createConversation, navigate]);

  // Follow the conversation while the user is at the bottom (keeps streaming
  // smooth); once they scroll up, stop auto-scrolling until they return.
  useEffect(() => {
    if (atBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [current?.messages.length, current?.messages[current?.messages.length - 1]?.content]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [id]);

  if (loading || !current || current.conversation._id !== id) {
    return <ChatSkeleton />;
  }

  const conversation = current.conversation;
  const messages = current.messages;

  const handleDelete = async () => {
    if (!window.confirm('Delete this conversation?')) return;
    await deleteConversation(id!);
    navigate('/chat');
  };

  const handleRename = async () => {
    if (!renameValue.trim()) return;
    await renameConversation(id!, renameValue.trim());
    setRenameOpen(false);
    toast.success('Renamed');
  };

  const handleShare = async () => {
    try {
      const payload = await apiPost<{ shareToken: string; shareUrl: string | null }>(
        `/api/v1/conversations/${id}/share`,
        { enabled: true }
      );
      const url = `${window.location.origin}/share/${payload.shareToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Share link copied to clipboard');
      } catch {
        window.prompt('Share link:', url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create share link');
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/conversations/${id}/export?format=${format}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('nf_access_token') ?? ''}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${id!.slice(-8)}.${format === 'markdown' ? 'md' : 'json'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    }
  };

  return (
    <div className="flex flex-col" style={{ position: 'absolute', inset: 0 }}>
      <div
        className="flex items-center justify-between chat-header-row"
        style={{ borderBottom: '1px solid var(--border-color)', flexShrink: 0, gap: 8 }}
      >
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          {conversation.pinned && <MdPushPin size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
          <span className="font-semibold ellipsis" style={{ fontSize: 15 }}>
            {conversation.title || 'Untitled chat'}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 2, flexShrink: 0 }}>
          <Button size="sm" variant="ghost" className="chat-action" onClick={() => { setRenameValue(conversation.title); setRenameOpen(true); }} title="Rename">
            <MdEdit size={15} /> <span className="chat-action-label">Rename</span>
          </Button>
          <Button size="sm" variant="ghost" className="chat-action" onClick={() => void handleShare()} title="Share">
            <MdLink size={15} /> <span className="chat-action-label">Share</span>
          </Button>
          <Button size="sm" variant="ghost" className="chat-action" onClick={() => void handleExport('markdown')} title="Export">
            <MdDownload size={15} /> <span className="chat-action-label">Export</span>
          </Button>
          <Button size="sm" variant="ghost" className="chat-action" onClick={() => void handleDelete()} title="Delete">
            <MdDelete size={15} />
          </Button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto scroll-thin chat-scroll"
        style={{ minHeight: 0, position: 'relative' }}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {messages.length === 0 ? (
            <EmptyChatHero />
          ) : (
            messages.map((message) => (
              <MessageBubble key={message._id} message={message} />
            ))
          )}
        </div>
      </div>

      <div className="chat-composer-wrap">
        {showScrollBtn && (
          <button
            className="scroll-bottom-btn"
            onClick={() => scrollToBottom('smooth')}
            title="Scroll to latest message"
            aria-label="Scroll to latest message"
          >
            <MdKeyboardArrowDown size={22} />
          </button>
        )}

        <ChatComposer
          onSend={(payload: ComposerSendPayload) =>
            session.sendMessage(payload.content, {
              language: payload.language,
              mode: payload.mode,
              attachments: payload.attachments,
            })
          }
          isStreaming={isStreaming}
          onStop={session.stop}
        />
      </div>

      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename conversation">
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="Conversation title"
          onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleRename()}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
