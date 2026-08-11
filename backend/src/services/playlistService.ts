import redis from '../config/redis';

export interface Song {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: number;
  addedBy: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  progress: number;
  lastUpdated: number;
}

const getPlaylistKey = (roomId: string) => `cwh:${roomId}:playlist`;
const getCurrentSongKey = (roomId: string) => `cwh:${roomId}:current_song`;
const getPlaybackKey = (roomId: string) => `cwh:${roomId}:playback`;

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

// Remove a song from the queue
export async function removeSongFromQueue(roomId: string, songId: string): Promise<Song[]> {
  const queue = await getPlaylistQueue(roomId);
  const updatedQueue = queue.filter(song => song.id !== songId);
  const key = getPlaylistKey(roomId);
  
  await redis.del(key);
  for (const song of updatedQueue) {
    await redis.rpush(key, JSON.stringify(song));
  }
  
  return updatedQueue;
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
    const elapsedSeconds = (Date.now() - playback.lastUpdated) / 1000;
    const progress = Math.min(playback.progress + elapsedSeconds, currentSong.duration);
    
    // Auto-stop if song has ended based on duration
    if (progress >= currentSong.duration) {
      playback = {
        isPlaying: false,
        progress: currentSong.duration,
        lastUpdated: Date.now()
      };
      await redis.set(playbackKey, JSON.stringify(playback));
    } else {
      playback.progress = progress;
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
  return redis.get(`cwh:${roomId}:host`);
}

// Set the room host in Redis if it doesn't exist
export async function setRoomHost(roomId: string, username: string): Promise<boolean> {
  const result = await redis.setnx(`cwh:${roomId}:host`, username);
  return result === 1;
}

// Check if a user has write permission in the room (is host or has explicit permission)
export async function hasWritePermission(roomId: string, username: string): Promise<boolean> {
  const host = await getRoomHost(roomId);
  if (!host) {
    // If no host exists yet, the first user automatically has permission (and will be registered as host)
    return true;
  }
  if (username === host) {
    return true;
  }
  const isMember = await redis.sismember(`cwh:${roomId}:write_permissions`, username);
  return isMember === 1;
}

// Grant write permission to a user
export async function grantWritePermission(roomId: string, username: string): Promise<void> {
  await redis.sadd(`cwh:${roomId}:write_permissions`, username);
}

// Revoke write permission from a user
export async function revokeWritePermission(roomId: string, username: string): Promise<void> {
  await redis.srem(`cwh:${roomId}:write_permissions`, username);
}
