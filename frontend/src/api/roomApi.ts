import { UserRoom } from '../types';
import { fetchWithAuth } from './client';

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
