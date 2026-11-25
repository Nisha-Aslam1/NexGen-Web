/**
 * Authenticated API Fetch helper
 * Uses in-memory Bearer token (never persisted in localStorage/sessionStorage)
 * Passes credentials: 'include' for HttpOnly cookies & sends CSRF custom header
 * Dispatches 'ng:unauthorized' event when an authenticated call receives 401
 */
let inMemoryAuthToken: string | null = null;

export function setInMemoryAuthToken(token: string | null): void {
  inMemoryAuthToken = token && token.trim() ? token.trim() : null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('ng_token');
    } catch {
      // ignore storage errors
    }
  }
}

export function getInMemoryAuthToken(): string | null {
  return inMemoryAuthToken;
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getInMemoryAuthToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include'
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (!urlStr.includes('/api/auth/login') && !urlStr.includes('/api/auth/session')) {
      window.dispatchEvent(new Event('ng:unauthorized'));
    }
  }

  return response;
}
