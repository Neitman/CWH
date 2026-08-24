import { UserPlaylist } from '../types';
import { fetchWithAuth } from './client';

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

export async function createPlaylistAPI(title: string, description: string): Promise<{ success: boolean; playlist?: UserPlaylist; error?: string }> {
  try {
    const res = await fetchWithAuth('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, playlist: data.playlist };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create playlist.' };
  }
}

export async function getPlaylistDetailsAPI(id: number): Promise<{ success: boolean; playlist?: UserPlaylist; items?: any[]; error?: string }> {
  try {
    const res = await fetchWithAuth(`/api/playlists/${id}`);
    const data = await res.json();
    if (res.ok) {
      return { success: true, playlist: data.playlist, items: data.items || [] };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch playlist details.' };
  }
}

export async function deletePlaylistAPI(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchWithAuth(`/api/playlists/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete playlist.' };
  }
}

export async function addSongToPlaylistAPI(playlistId: number, song: { id: string; title: string; thumbnail?: string; channelTitle?: string; duration?: number }): Promise<{ success: boolean; item?: any; error?: string }> {
  try {
    const res = await fetchWithAuth(`/api/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: song.id,
        title: song.title,
        thumbnail: song.thumbnail || '',
        channelTitle: song.channelTitle || '',
        duration: song.duration || 0
      })
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true, item: data.item };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add song to playlist.' };
  }
}

export async function removeSongFromPlaylistAPI(playlistId: number, itemId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchWithAuth(`/api/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to remove song from playlist.' };
  }
}
