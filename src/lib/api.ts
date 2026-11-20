/**
 * Authenticated API Fetch helper
 * Automatically attaches Authorization: Bearer <token> if stored in localStorage
 * Passes credentials: 'include' for HttpOnly cookies
 * Dispatches 'ng:unauthorized' event when an authenticated call receives 401
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : null;
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include'
  });

  if (response.status === 401 && typeof window !== 'undefined' && token) {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (!urlStr.includes('/api/auth/login')) {
      window.dispatchEvent(new Event('ng:unauthorized'));
    }
  }

  return response;
}
