// Shared API types for the NoticeFlow frontend.

export interface ApiError {
  success: false;
  message: string;
  error?: string;
  code?: string;
}

export interface AuthUser {
  id: string;
  role: 'admin' | 'user';
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface QuotaWindow {
  used: number;
  limit: number;
  remaining: number;
}

export interface QuotaStatus {
  daily: QuotaWindow;
  monthly: QuotaWindow;
  exhausted: boolean;
}

export interface UserUsage {
  quota: QuotaStatus;
  today?: {
    chats: number;
    tokens: number;
  };
  total?: {
    chats: number;
    tokens: number;
  };
}

export interface Conversation {
  _id: string;
  title: string;
  pinned: boolean;
  isArchived: boolean;
  shareToken: string | null;
  shareEnabled: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  messageCount?: number;
}

export interface Citation {
  sourceNumber: number;
  title: string;
  category: string;
  excerpt: string;
  chunkIndex: number;
  reason: string;
  noticeId?: string | null;
  fileId?: string | null;
  fileUrl?: string | null;
  fullNoticeUrl?: string | null;
  mimeType?: string | null;
  // --- Class 3 textbook citations (real book metadata, never invented) ---
  kind?: 'book' | 'notice';
  bookId?: string | null;
  bookTitle?: string | null;
  chapterTitle?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  chunkId?: string | null;
}

export interface Source {
  noticeId: string;
  title: string;
  category: string;
  fileUrl: string | null;
  fullNoticeUrl: string;
  mimeType?: string | null;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'stopped' | 'error';

/** Metadata for a temporary chat attachment (bytes are never persisted). */
export interface ChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  mimeType: string;
  size: number;
  createdAt?: number;
}

export type AIMode = 'fast' | 'balanced' | 'accurate';

export interface MessageFeedback {
  type: 'like' | 'dislike';
  comment?: string;
}

export interface ChatMessage {
  _id: string;
  conversation: string;
  user: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  citations?: Citation[];
  sources?: Source[];
  attachments?: ChatAttachment[];
  feedback?: MessageFeedback | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
}

export interface SharedChat {
  title: string;
  ownerName: string;
  createdAt: string;
  messages: { role: MessageRole; content: string; createdAt: string }[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ---- SSE stream events (POST /api/v1/conversations/:id/messages) ----
export type StreamEvent =
  | { type: 'start'; messageId: string; conversationId: string }
  | { type: 'token'; content: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number; remaining: number; dailyLimit: number; dailyUsed: number; exhausted: boolean }
  | { type: 'done'; messageId: string; status: string; finishReason: string; model: string }
  | { type: 'error'; message: string }
  | { type: 'citations'; citations: Citation[]; sources: Source[] };

// ---- Class 3 AI Tutor ----

export type TutorAnswerStatus = 'ANSWERED' | 'INSUFFICIENT_BOOK_CONTEXT' | 'CLARIFICATION_NEEDED';

export interface TutorSource {
  bookId: string;
  bookTitle: string;
  chapterId?: string;
  chapterTitle?: string;
  pageStart?: number;
  pageEnd?: number;
  chunkId: string;
}

export interface TutorResponse {
  answer: string;
  answerLanguage: 'bn' | 'en' | 'banglish';
  answerStatus: TutorAnswerStatus;
  sources: TutorSource[];
  lesson?: LessonPlan;
  quiz?: QuizPreview;
  followUpQuestion?: string;
  requestId: string;
  provider?: string;
  model?: string;
}

export type SlideType = 'TITLE' | 'EXPLANATION' | 'IMAGE' | 'DIAGRAM' | 'EXAMPLE' | 'INTERACTIVE' | 'QUIZ' | 'SUMMARY';

export interface TutorSlide {
  type: SlideType;
  title: string;
  body: string;
  imageUrl?: string;
  diagramKind?: 'fraction-bar' | 'number-line' | 'shapes' | 'tally' | 'none';
  quizOptions?: string[];
  quizAnswerIndex?: number;
}

export interface LessonPlan {
  lessonId: string;
  title: string;
  subject?: string;
  slides: TutorSlide[];
}

export interface QuizPreview {
  question: string;
  options: string[];
  answerIndex: number;
}

export interface BookInfo {
  _id: string;
  title: string;
  subject: string;
  grade: string;
  curriculum: string;
  language: string;
  edition?: string;
  publisher?: string;
  chunkCount?: number;
  pageCount?: number;
  updatedAt?: string;
}

export interface AdminBook extends BookInfo {
  sourceNotes?: string;
  rightsStatus?: string;
  fileSize?: number;
  checksum?: string;
  processingState: 'pending' | 'processing' | 'ready' | 'failed';
  processingError?: string;
  processingProgress?: number;
  publicationState: 'draft' | 'published' | 'archived';
  version?: number;
  publishedAt?: string | null;
  createdAt?: string;
}

export interface IngestionJob {
  _id: string;
  kind: string;
  state: 'queued' | 'processing' | 'done' | 'failed';
  progress: number;
  errorCode?: string;
  errorMessage?: string;
  warnings?: string[];
  createdAt?: string;
  finishedAt?: string | null;
}

export interface ProviderSummary {
  id: string;
  displayName: string;
  implemented: boolean;
  capabilities: { text: boolean; structuredOutput: boolean; vision: boolean; streaming: boolean } | null;
  models: { modelId: string; label: string }[];
}

// ---- Admin ----
export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
  usage?: {
    today: { chats: number; tokens: number };
    total: { chats: number; tokens: number };
  };
}

export interface AdminNotice {
  _id: string;
  title: string;
  category: string;
  type: string;
  mimeType?: string;
  summary?: string;
  createdAt: string;
  fileId?: string | null;
  fileUrl?: string | null;
  hasFullText?: boolean;
  chunkCount?: number;
}

export interface ChatLogEntry {
  _id: string;
  userId?: string | null;
  userName?: string;
  query: string;
  answer: string;
  mode: string;
  confidence?: string;
  sources?: Source[];
  citations?: Citation[];
  createdAt: string;
  feedback?: { type: string; comment?: string } | null;
}

export interface DashboardStats {
  users: { total: number; newToday: number; activeToday: number };
  conversations: number;
  messages: number;
  notices: { total: number; byCategory: Record<string, number> };
  feedback: { total: number; likes: number; dislikes: number };
  usageToday: { tokens: number; chats: number; cost?: number };
  quota: {
    dailyLimit: number;
    dailyUsed: number;
    monthlyLimit: number;
    monthlyUsed: number;
  };
  charts?: {
    messagesByDay: { date: string; count: number }[];
    usageByDay: { date: string; tokens: number }[];
  };
  recentUsers?: AdminUser[];
  recentChats?: ChatLogEntry[];
}

export interface UsagePoint {
  date: string;
  tokens: number;
  chats: number;
  cost?: number;
}

export interface TokenOverview {
  today: { tokens: number; chats: number; cost?: number };
  month: { tokens: number; chats: number; cost?: number };
  total: { tokens: number; chats: number; cost?: number };
  dailyLimit: number;
  monthlyLimit: number;
  byModel?: { model: string; tokens: number; chats: number }[];
  topUsers?: { userId: string; name?: string; email?: string; tokens: number; chats: number }[];
}

export interface SettingsEntry {
  key: string;
  value: unknown;
  group?: string;
  description?: string;
}

export interface PromptTemplate {
  _id: string;
  name: string;
  key: string;
  description?: string;
  content: string;
  isActive: boolean;
  isDefault?: boolean;
  createdAt: string;
}

export interface LogRecord {
  _id: string;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface SystemInfo {
  status: string;
  uptime: number;
  nodeVersion: string;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  database: {
    connected: boolean;
    name: string;
    host?: string;
  };
  env: string;
  version: string;
  model?: string;
  apiKeyConfigured?: boolean;
  queue?: { pending: number; processing: number };
  routes?: number;
}
