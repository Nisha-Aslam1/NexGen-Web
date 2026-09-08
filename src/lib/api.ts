/**
 * Authenticated API Fetch helper
 * Automatically attaches Authorization: Bearer <token> if stored in localStorage
 * Also passes credentials: 'include' for cookies
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ng_token') : null;
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include'
  });
}
