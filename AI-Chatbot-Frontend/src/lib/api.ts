import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types';

const ACCESS_KEY = 'nf_access_token';
const REFRESH_KEY = 'nf_refresh_token';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) throw new Error('No refresh token');

  const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
    refreshToken,
  });
  const tokens = data?.tokens;
  if (!tokens?.accessToken) throw new Error('Refresh failed');

  tokenStore.set(tokens.accessToken, tokens.refreshToken ?? refreshToken);
  return tokens.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    const isAuthEndpoint =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/register') ||
      original?.url?.includes('/auth/refresh');

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      original &&
      !original._retried
    ) {
      original._retried = true;
      try {
        refreshInFlight = refreshInFlight ?? refreshAccessToken();
        const token = await refreshInFlight;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new ApiRequestError('Session expired. Please log in again.', 401);
      } finally {
        refreshInFlight = null;
      }
    }

    if (error.response?.data?.message) {
      throw new ApiRequestError(error.response.data.message, error.response.status);
    }
    if (error.response?.status === 429) {
      throw new ApiRequestError(
        error.response.data?.message || 'Too many requests. Please try again later.',
        429
      );
    }
    throw new ApiRequestError(error.message || 'Network error. Please try again.', error.response?.status ?? 0);
  }
);

export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.get(url, config);
  return data as T;
}

export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.post(url, body, config);
  return data as T;
}

export async function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.put(url, body, config);
  return data as T;
}

export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.patch(url, body, config);
  return data as T;
}

/** Multipart upload (FormData). The auth interceptor adds the bearer token. */
export async function apiUpload<T>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.post(url, formData, {
    ...config,
    headers: { 'Content-Type': 'multipart/form-data', ...config?.headers },
    timeout: 120000,
  });
  return data as T;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.delete(url, config);
  return data as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (axios.isAxiosError(error)) return error.response?.data?.message || error.message;
  return error instanceof Error ? error.message : 'Something went wrong';
}

/**
 * True when the backend does not implement the called route (stale deploy).
 * Callers should show a persistent "backend outdated" notice instead of a
 * bare toast so the admin knows to redeploy ,  not retry the same click.
 */
export function isRouteNotFoundError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.status === 404 && /route not found/i.test(error.message);
  }
  if (axios.isAxiosError(error)) {
    return (
      error.response?.status === 404 &&
      /route not found/i.test(String(error.response?.data?.message ?? ''))
    );
  }
  return false;
}

/** Reads an SSE stream from an authenticated POST request. */
export async function streamPost(
  url: string,
  body: unknown,
  onEvent: (event: { type: string; [key: string]: unknown }) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = tokenStore.access;
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {
      // ignore parse errors
    }
    throw new ApiRequestError(message, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ApiRequestError('Stream not supported', 0);

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 2);
      if (!rawEvent.trim()) continue;

      for (const line of rawEvent.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed && typeof parsed === 'object') {
            onEvent(parsed as { type: string; [key: string]: unknown });
          }
        } catch {
          // skip malformed frames
        }
      }
    }
  }
}
