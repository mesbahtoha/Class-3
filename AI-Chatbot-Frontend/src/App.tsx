import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AppShell } from '@/components/layout/AppShell';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/routes/guards';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { LandingPage } from '@/pages/LandingPage';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';

// Route-level code splitting: heavy pages (markdown/katex/highlight.js,
// admin tables & charts) are loaded on demand so the initial bundle stays small.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/auth/PasswordPages').then((m) => ({ default: m.ResetPasswordPage })));
const ChatPage = lazy(() => import('@/pages/chat/ChatPage').then((m) => ({ default: m.ChatPage })));
const ShareView = lazy(() => import('@/pages/chat/ShareView').then((m) => ({ default: m.ShareView })));
const WelcomePage = lazy(() => import('@/pages/WelcomePage').then((m) => ({ default: m.WelcomePage })));
const TutorPage = lazy(() => import('@/pages/TutorPage').then((m) => ({ default: m.TutorPage })));
const BooksPage = lazy(() => import('@/pages/BooksPage').then((m) => ({ default: m.BooksPage })));
const BookDetailPage = lazy(() => import('@/pages/BookDetailPage').then((m) => ({ default: m.BookDetailPage })));
const LearnPage = lazy(() => import('@/pages/LearnPage').then((m) => ({ default: m.LearnPage })));
const PracticePage = lazy(() => import('@/pages/PracticePage').then((m) => ({ default: m.PracticePage })));
const MatchRequestsPage = lazy(() => import('@/pages/exercises/MatchRequestsPage').then((m) => ({ default: m.MatchRequestsPage })));
const AboutPage = lazy(() => import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('@/pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const HelpPage = lazy(() => import('@/pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminUsers = lazy(() => import('@/pages/admin/Users').then((m) => ({ default: m.AdminUsers })));
const AdminNotices = lazy(() => import('@/pages/admin/Notices').then((m) => ({ default: m.AdminNotices })));
const AdminChats = lazy(() => import('@/pages/admin/Chats').then((m) => ({ default: m.AdminChats })));
const AdminAnalytics = lazy(() => import('@/pages/admin/Analytics').then((m) => ({ default: m.AdminAnalytics })));
const AdminTokens = lazy(() => import('@/pages/admin/Tokens').then((m) => ({ default: m.AdminTokens })));
const AdminBooks = lazy(() => import('@/pages/admin/Books').then((m) => ({ default: m.AdminBooks })));
const AdminAISettings = lazy(() => import('@/pages/admin/AISettings').then((m) => ({ default: m.AdminAISettings })));
const AdminSettings = lazy(() => import('@/pages/admin/Settings').then((m) => ({ default: m.AdminSettings })));
const AdminPromptTemplates = lazy(() => import('@/pages/admin/PromptTemplates').then((m) => ({ default: m.AdminPromptTemplates })));
const AdminLogs = lazy(() => import('@/pages/admin/Logs').then((m) => ({ default: m.AdminLogs })));
const AdminSystem = lazy(() => import('@/pages/admin/System').then((m) => ({ default: m.AdminSystem })));

const PageLoader = () => <FullPageSpinner label="Loading…" />;

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const logout = useAuthStore((s) => s.logout);
  const resetChat = useChatStore((s) => s.reset);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const onExpired = () => {
      void logout();
      window.location.assign('/login');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [logout]);

  useEffect(() => {
    return () => resetChat();
  }, [resetChat]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/books/:bookId" element={<BookDetailPage />} />
          <Route path="/learn/:lessonId" element={<LearnPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/exercise/match-requests" element={<MatchRequestsPage />} />
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>
          <Route path="/share/:token" element={<ShareView />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
          </Route>
        </Route>

        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/books" element={<AdminBooks />} />
            <Route path="/admin/ai-settings" element={<AdminAISettings />} />
            <Route path="/admin/notices" element={<AdminNotices />} />
            <Route path="/admin/chats" element={<AdminChats />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/tokens" element={<AdminTokens />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/prompt-templates" element={<AdminPromptTemplates />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
            <Route path="/admin/system" element={<AdminSystem />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
