import { User, UserRoom, UserPlaylist } from './types';

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
      // Schedule background refresh 30 seconds before access token expires
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

// -------------------------------------------------------------
// Dual-Token Auto Refresh & Interceptor
// -------------------------------------------------------------
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
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
      if (refreshTimer) clearTimeout(refreshTimer);
      return null;
    }
  } catch (err) {
    console.error('Failed to refresh access token:', err);
    return null;
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = localStorage.getItem('token');
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  options.headers = headers;

  let res = await fetch(url, options);

  // Catch both 401 (Unauthorized) and 403 (Forbidden) for token expiration/refresh
  if (res.status === 401 || res.status === 403) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      options.headers = retryHeaders;
      res = await fetch(url, options);
    }
  }

  return res;
}

// -------------------------------------------------------------
// Auth API Calls
// -------------------------------------------------------------
export async function fetchUserProfile(): Promise<User | null> {
  const storedToken = localStorage.getItem('token');
  if (!storedToken) {
    setCurrentUser(null);
    return null;
  }

  scheduleTokenRefresh();

  try {
    const res = await fetchWithAuth('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setCurrentUser(data.user);
      return data.user;
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setCurrentUser(null);
      return null;
    }
  } catch (error) {
    console.error('Failed to verify token:', error);
    setCurrentUser(null);
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await fetchWithAuth('/api/auth/logout', { method: 'POST' });
  } catch (err) {}
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  setCurrentUser(null);
}

export async function updateDisplayName(displayName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchWithAuth('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    });
    const data = await res.json();
    if (res.ok) {
      await fetchUserProfile();
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Server connection failed.' };
  }
}

export async function uploadAvatar(file: File): Promise<{ success: boolean; error?: string; avatarUrl?: string }> {
  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetchWithAuth('/api/auth/avatar', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      await fetchUserProfile();
      return { success: true, avatarUrl: data.avatarUrl };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to upload avatar' };
  }
}

// -------------------------------------------------------------
// User Rooms API Calls
// -------------------------------------------------------------
export async function getUserRooms(): Promise<UserRoom[]> {
  try {
    const res = await fetchWithAuth('/api/rooms/my-rooms');
    if (res.ok) {
      const data = await res.json();
      return data.rooms || [];
    }
    return [];
  } catch (err) {
    console.error('Failed to fetch user rooms:', err);
    return [];
  }
}

export async function createRoomAPI(name: string, description: string): Promise<{ success: boolean; room?: UserRoom; error?: string }> {
  try {
    const res = await fetchWithAuth('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, room: data.room };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create room.' };
  }
}

export async function updateRoomAPI(id: number, name: string, description: string): Promise<{ success: boolean; room?: UserRoom; error?: string }> {
  try {
    const res = await fetchWithAuth(`/api/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, room: data.room };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update room.' };
  }
}

export async function deleteRoomAPI(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchWithAuth(`/api/rooms/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete room.' };
  }
}

export async function joinRoomAPI(roomCode: string): Promise<{ success: boolean; room?: { room_id: string; name: string; description: string | null; owner_username: string }; error?: string }> {
  try {
    const code = roomCode.trim().toLowerCase();
    if (!code) return { success: false, error: 'Please enter a room code.' };
    const res = await fetch(`/api/rooms/info/${encodeURIComponent(code)}`);
    const data = await res.json();
    if (res.ok && data.room) {
      return { success: true, room: data.room };
    }
    return { success: false, error: data.error || 'Room not found.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to look up room.' };
  }
}

// -------------------------------------------------------------
// Playlists API Calls
// -------------------------------------------------------------
export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  try {
    const res = await fetchWithAuth('/api/playlists');
    if (res.ok) {
      const data = await res.json();
      return data.playlists || [];
    }
    return [];
  } catch (err) {
    console.error('Failed to fetch playlists:', err);
    return [];
  }
}
