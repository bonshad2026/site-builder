const configuredApi = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
/** VITE_API_URL=same-origin: the API is served from the page's own origin (studio and previews). */
export const API_URL = (configuredApi === 'same-origin' && typeof window !== 'undefined' ? window.location.origin : configuredApi).replace(/\/$/, '');

/** Without an API the public site runs on bundled demo content and the admin panel is unavailable. */
export const apiAvailable = () => API_URL !== '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)sb_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export interface Envelope<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * JSON request to the API. Sends the session cookie and, for state-changing
 * requests, the CSRF token. Throws ApiError with the server's error code.
 */
export async function apiRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<Envelope<T>> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = csrfToken();
    if (token) headers['X-CSRF-Token'] = token;
  }
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers,
    credentials: 'include',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return { data: undefined as T };
  const json = (await res.json().catch(() => null)) as (Envelope<T> & { error?: { code: string; message: string; details?: { path: string; message: string }[] } }) | null;
  if (!res.ok || !json) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? 'network_error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return json;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path).then((r) => r.data),
  page: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body: body ?? {} }).then((r) => r.data),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PUT', body }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }).then((r) => r.data),
  delete: (path: string) => apiRequest<void>(path, { method: 'DELETE' }).then(() => undefined),
};

/** Multipart upload with progress (fetch cannot report upload progress). */
export function uploadFile<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/v1${path}`);
    xhr.withCredentials = true;
    const token = csrfToken();
    if (token) xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const json = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300 && json) resolve(json.data as T);
      else reject(new ApiError(xhr.status, json?.error?.code ?? 'upload_failed', json?.error?.message ?? 'Upload failed'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error during upload'));
    xhr.send(form);
  });
}
