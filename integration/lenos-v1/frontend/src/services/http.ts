const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export const isBackendConfigured = Boolean(apiBaseUrl);
export const backendUnavailableMessage = 'This service is temporarily unavailable. Please check back soon.';

export function apiUrl(path: string): string {
  if (!isBackendConfigured) throw new Error(backendUnavailableMessage);
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Aurie-Client', 'web');
  return fetch(apiUrl(path), { signal: AbortSignal.timeout(20000), ...init, headers, credentials: 'include' });
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(typeof data?.error === 'string' ? data.error : 'The request could not be completed. Please try again.', response.status, data?.code);
  }
  return response.status === 204 ? undefined as T : response.json();
}
