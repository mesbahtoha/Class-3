import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from './api';
import type { AdminBook, BookInfo, IngestionJob, ProviderSummary, QuizPreview, TutorResponse, TutorSource } from '@/types';

export interface GuestChatResult {
  tutor: TutorResponse;
}

export async function guestChat(message: string, options?: { language?: string; subject?: string; bookId?: string }): Promise<TutorResponse> {
  const payload = await apiPost<GuestChatResult>('/api/v1/tutor/guest-chat', {
    message,
    ...(options?.language ? { language: options.language } : {}),
    ...(options?.subject ? { subject: options.subject } : {}),
    ...(options?.bookId ? { bookId: options.bookId } : {}),
  });
  return payload.tutor;
}

export async function tutorChat(message: string, options?: { language?: string; subject?: string; bookId?: string }): Promise<TutorResponse> {
  const payload = await apiPost<GuestChatResult>('/api/v1/tutor/chat', {
    message,
    ...(options?.language ? { language: options.language } : {}),
    ...(options?.subject ? { subject: options.subject } : {}),
    ...(options?.bookId ? { bookId: options.bookId } : {}),
  });
  return payload.tutor;
}

/** Grounded practice question (authenticated). Returns null when no book context exists. */
export async function makeTutorQuiz(topic: string, options?: { language?: string; subject?: string; bookId?: string }): Promise<{ quiz: QuizPreview; sources: TutorSource[] } | null> {
  try {
    return await apiPost<{ quiz: QuizPreview; sources: TutorSource[] }>('/api/v1/tutor/quiz', {
      message: topic,
      ...(options?.language ? { language: options.language } : {}),
      ...(options?.subject ? { subject: options.subject } : {}),
      ...(options?.bookId ? { bookId: options.bookId } : {}),
    });
  } catch {
    return null;
  }
}

/** Stateless tutor feedback (guests included). Never throws ,  UI must not punish the child. */
export async function sendTutorFeedback(requestId: string, helpful: boolean): Promise<void> {
  try {
    await apiPost('/api/v1/tutor/feedback', { requestId, helpful });
  } catch {
    // best-effort only
  }
}

export async function listBooks(params?: { subject?: string; search?: string }): Promise<BookInfo[]> {
  const query = new URLSearchParams();
  if (params?.subject) query.set('subject', params.subject);
  if (params?.search) query.set('search', params.search);
  const payload = await apiGet<{ books: BookInfo[] }>(`/api/v1/books?${query.toString()}`);
  return payload.books ?? [];
}

export async function getBook(id: string): Promise<{ book: BookInfo; samples: { chunkId: string; chapterTitle?: string; pageStart?: number; pageEnd?: number; preview: string }[] }> {
  return apiGet(`/api/v1/books/${id}`);
}

// ---- Admin ----

export async function adminListBooks(params?: { search?: string; subject?: string; publicationState?: string }): Promise<AdminBook[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.subject) query.set('subject', params.subject);
  if (params?.publicationState) query.set('publicationState', params.publicationState);
  const payload = await apiGet<{ books: AdminBook[] }>(`/api/v1/admin/books?${query.toString()}`);
  return payload.books ?? [];
}

export async function adminGetBook(id: string): Promise<{ book: AdminBook; jobs: IngestionJob[]; samples: { chunkId: string; chunkIndex: number; chapterTitle?: string; pageStart?: number; pageEnd?: number; preview: string }[] }> {
  return apiGet(`/api/v1/admin/books/${id}`);
}

export async function adminUploadBook(form: FormData): Promise<{ book: AdminBook; jobId: string }> {
  return apiUpload('/api/v1/admin/books', form);
}

export async function adminUpdateBook(id: string, body: Record<string, unknown>): Promise<{ book: AdminBook }> {
  return apiPatch(`/api/v1/admin/books/${id}`, body);
}

async function adminBookAction(id: string, action: 'publish' | 'unpublish' | 'reindex' | 'archive'): Promise<unknown> {
  return apiPost(`/api/v1/admin/books/${id}/${action}`, {});
}

export const adminPublishBook = (id: string) => adminBookAction(id, 'publish');
export const adminUnpublishBook = (id: string) => adminBookAction(id, 'unpublish');
export const adminReindexBook = (id: string) => adminBookAction(id, 'reindex');
export const adminArchiveBook = (id: string) => adminBookAction(id, 'archive');

export async function adminDeleteBook(id: string): Promise<void> {
  await apiDelete(`/api/v1/admin/books/${id}`);
}

export interface ProviderSettings {
  active: { provider: string; model: string; fallbacks: { providerId: string; model: string }[]; temperature: number; maxTokens: number; timeoutMs: number };
  providers: ProviderSummary[];
  credentials: Record<string, { configured: boolean; masked: string | null; source?: string; endpoint?: string | null }>;
}

export async function adminGetProviders(): Promise<ProviderSettings> {
  return apiGet('/api/v1/admin/providers');
}

export async function adminUpdateProviders(body: Record<string, unknown>): Promise<void> {
  await apiPut('/api/v1/admin/providers', body);
}

export async function adminValidateProvider(providerId: string): Promise<{ ok: boolean; latencyMs: number; model: string | null }> {
  return apiPost(`/api/v1/admin/providers/${providerId}/validate`, {});
}
