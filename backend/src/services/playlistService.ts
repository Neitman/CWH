import redis from '../config/redis';
import fs from 'fs';
import path from 'path';

export interface Song {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: number;
  addedBy: string;
  type?: 'youtube' | 'custom';
  videoUrl?: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  progress: number;
  lastUpdated: number;
}

const getPlaylistKey = (roomId: string) => `wp:${roomId}:playlist`;
const getCurrentSongKey = (roomId: string) => `wp:${roomId}:current_song`;
const getPlaybackKey = (roomId: string) => `wp:${roomId}:playback`;

// Retrieve all songs in the queue
export async function getPlaylistQueue(roomId: string): Promise<Song[]> {
  const key = getPlaylistKey(roomId);
  const items = await redis.lrange(key, 0, -1);
  return items.map(item => JSON.parse(item));
}

// Append a song to the queue
export async function addSongToQueue(roomId: string, song: Song): Promise<Song[]> {
  const key = getPlaylistKey(roomId);
  await redis.rpush(key, JSON.stringify(song));
  return getPlaylistQueue(roomId);
}

// Append multiple songs to the queue
export async function addSongsToQueue(roomId: string, songs: Song[]): Promise<Song[]> {
  if (songs.length === 0) return getPlaylistQueue(roomId);
  const key = getPlaylistKey(roomId);
  const items = songs.map(song => JSON.stringify(song));
  await redis.rpush(key, ...items);
  return getPlaylistQueue(roomId);
}

export function cleanupCustomVideoFile(song: Song | null) {
  if (!song || song.type !== 'custom' || !song.videoUrl) return;
  try {
    const parts = song.videoUrl.split('/api/videos/stream/');
    if (parts.length > 1) {
      const filename = parts[1];
      const uploadsDir = path.join(__dirname, '../../public/uploads/videos');
      const filePath = path.join(uploadsDir, filename);
      if (filePath.startsWith(uploadsDir) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Auto Cleanup] Successfully deleted video file from disk: ${filename}`);
      }
    }
  } catch (err) {
    console.error(`[Auto Cleanup] Error deleting file for "${song.title}":`, err);
  }
}

// Remove a song from the queue
export async function removeSongFromQueue(roomId: string, songId: string): Promise<Song[]> {
  const queue = await getPlaylistQueue(roomId);
  const removedSong = queue.find(song => song.id === songId);
  const updatedQueue = queue.filter(song => song.id !== songId);
  const key = getPlaylistKey(roomId);
  
  await redis.del(key);
  for (const song of updatedQueue) {
    await redis.rpush(key, JSON.stringify(song));
  }
  
  if (removedSong) {
    cleanupCustomVideoFile(removedSong);
  }
  
  return updatedQueue;
}

export function parseDurationSeconds(dur: any): number {
  if (typeof dur === 'number' && !isNaN(dur) && dur > 0) return dur;
  if (typeof dur === 'string') {
    if (dur.includes(':')) {
      const parts = dur.split(':').map(p => parseInt(p, 10) || 0);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const parsed = parseInt(dur, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 300; // 5 mins fallback
}

// Retrieve active playback state with drift compensation
export async function getPlaybackState(roomId: string): Promise<{ currentSong: Song | null; playback: PlaybackState }> {
  const currentSongKey = getCurrentSongKey(roomId);
  const currentSongStr = await redis.get(currentSongKey);
  const currentSong: Song | null = currentSongStr ? JSON.parse(currentSongStr) : null;

  const playbackKey = getPlaybackKey(roomId);
  const playbackStr = await redis.get(playbackKey);
  let playback: PlaybackState = playbackStr 
    ? JSON.parse(playbackStr) 
    : { isPlaying: false, progress: 0, lastUpdated: Date.now() };

  if (playback.isPlaying && currentSong) {
    const lastUp = playback.lastUpdated || Date.now();
    const elapsedSeconds = Math.max(0, (Date.now() - lastUp) / 1000);
    const durSec = parseDurationSeconds(currentSong.duration);
    const calculatedProgress = Math.floor(playback.progress + elapsedSeconds);
    
    if (calculatedProgress >= durSec) {
      playback = {
        isPlaying: false,
        progress: durSec,
        lastUpdated: Date.now()
      };
      await redis.set(playbackKey, JSON.stringify(playback));
    } else {
      playback.progress = calculatedProgress;
    }
  }

  return { currentSong, playback };
}

// Save explicit updates to player progress/play states
export async function setPlaybackState(roomId: string, isPlaying: boolean, progress: number): Promise<PlaybackState> {
  const playbackKey = getPlaybackKey(roomId);
  const playback: PlaybackState = {
    isPlaying,
    progress,
    lastUpdated: Date.now()
  };
  await redis.set(playbackKey, JSON.stringify(playback));
  return playback;
}

// Play next song in line
export async function playNextSong(roomId: string): Promise<{ currentSong: Song | null; playback: PlaybackState; queue: Song[] }> {
  const playlistKey = getPlaylistKey(roomId);
  const currentSongKey = getCurrentSongKey(roomId);
  
  // Cleanup previously playing video file if custom
  const oldSongStr = await redis.get(currentSongKey);
  if (oldSongStr) {
    try {
      const oldSong: Song = JSON.parse(oldSongStr);
      cleanupCustomVideoFile(oldSong);
    } catch (e) {}
  }

  const nextSongStr = await redis.lpop(playlistKey);
  const queue = await getPlaylistQueue(roomId);
  
  if (nextSongStr) {
    const nextSong: Song = JSON.parse(nextSongStr);
    await redis.set(currentSongKey, JSON.stringify(nextSong));
    
    const playbackKey = getPlaybackKey(roomId);
    const playback: PlaybackState = {
      isPlaying: true,
      progress: 0,
      lastUpdated: Date.now()
    };
    await redis.set(playbackKey, JSON.stringify(playback));
    
    return { currentSong: nextSong, playback, queue };
  } else {
    // Clear out current playback as playlist ended
    await redis.del(currentSongKey);
    const playback = await setPlaybackState(roomId, false, 0);
    return { currentSong: null, playback, queue };
  }
}

// Get the room host from Redis
export async function getRoomHost(roomId: string): Promise<string | null> {
  return redis.get(`wp:${roomId}:host`);
}

// Set the room host in Redis if it doesn't exist
export async function setRoomHost(roomId: string, username: string): Promise<boolean> {
  const result = await redis.setnx(`wp:${roomId}:host`, username);
  return result === 1;
}

// Check if a user has write permission in the room (all room members have full access)
export async function hasWritePermission(roomId: string, username: string): Promise<boolean> {
  return true;
}

// Grant write permission to a user
export async function grantWritePermission(roomId: string, username: string): Promise<void> {
  await redis.sadd(`wp:${roomId}:write_permissions`, username);
}

// Revoke write permission from a user
export async function revokeWritePermission(roomId: string, username: string): Promise<void> {
  await redis.srem(`wp:${roomId}:write_permissions`, username);
}
