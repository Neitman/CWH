import { User } from '../types';
import { fetchWithAuth, refreshAccessToken, scheduleTokenRefresh, setCurrentUser } from './client';

export async function fetchUserProfile(): Promise<User | null> {
  let storedToken = localStorage.getItem('token');
  
  if (!storedToken) {
    storedToken = await refreshAccessToken();
  }

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
