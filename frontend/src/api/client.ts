import { User } from '../types';

export let currentUser: User | null = null;

export function setCurrentUser(user: User | null) {
  currentUser = user;
}

let refreshTimer: any = null;

export function scheduleTokenRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);

  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return;
    const payload = JSON.parse(atob(payloadBase64));
    
    if (payload.exp) {
      const expiresAtMs = payload.exp * 1000;
      const nowMs = Date.now();
      const refreshInMs = Math.max(2000, expiresAtMs - nowMs - 30000);

      refreshTimer = setTimeout(async () => {
        const newToken = await refreshAccessToken();
        if (newToken) {
          scheduleTokenRefresh();
        }
      }, refreshInMs);
    }
  } catch (err) {
    console.warn('Proactive token refresh schedule error:', err);
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    const res = await fetch('/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include'
    });

    if (res.ok) {
      const data = await res.json();
      const newAccessToken = data.accessToken || data.token;
      localStorage.setItem('token', newAccessToken);
      scheduleTokenRefresh();
      return newAccessToken;
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setCurrentUser(null);
      return null;
    }
  } catch (err) {
    return null;
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = localStorage.getItem('token');

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...options, headers });
    }
  }

  return response;
}
