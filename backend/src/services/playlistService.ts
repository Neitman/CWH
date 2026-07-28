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

const KEY_PLAYLIST = 'cwh:playlist';
const KEY_CURRENT_SONG = 'cwh:current_song';
const KEY_PLAYBACK = 'cwh:playback';

// Retrieve all songs in the queue
export async function getPlaylistQueue(): Promise<Song[]> {
  const items = await redis.lrange(KEY_PLAYLIST, 0, -1);
  return items.map(item => JSON.parse(item));
}

// Append a song to the queue
export async function addSongToQueue(song: Song): Promise<Song[]> {
  await redis.rpush(KEY_PLAYLIST, JSON.stringify(song));
  return getPlaylistQueue();
}

// Remove a song from the queue
export async function removeSongFromQueue(songId: string): Promise<Song[]> {
  const queue = await getPlaylistQueue();
  const updatedQueue = queue.filter(song => song.id !== songId);
  
  await redis.del(KEY_PLAYLIST);
  for (const song of updatedQueue) {
    await redis.rpush(KEY_PLAYLIST, JSON.stringify(song));
  }
  
  return updatedQueue;
}

// Retrieve active playback state with drift compensation
export async function getPlaybackState(): Promise<{ currentSong: Song | null; playback: PlaybackState }> {
  const currentSongStr = await redis.get(KEY_CURRENT_SONG);
  const currentSong: Song | null = currentSongStr ? JSON.parse(currentSongStr) : null;

  const playbackStr = await redis.get(KEY_PLAYBACK);
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
      await redis.set(KEY_PLAYBACK, JSON.stringify(playback));
    } else {
      playback.progress = progress;
    }
  }

  return { currentSong, playback };
}

// Save explicit updates to player progress/play states
export async function setPlaybackState(isPlaying: boolean, progress: number): Promise<PlaybackState> {
  const playback: PlaybackState = {
    isPlaying,
    progress,
    lastUpdated: Date.now()
  };
  await redis.set(KEY_PLAYBACK, JSON.stringify(playback));
  return playback;
}

// Play next song in line
export async function playNextSong(): Promise<{ currentSong: Song | null; playback: PlaybackState; queue: Song[] }> {
  const nextSongStr = await redis.lpop(KEY_PLAYLIST);
  const queue = await getPlaylistQueue();
  
  if (nextSongStr) {
    const nextSong: Song = JSON.parse(nextSongStr);
    await redis.set(KEY_CURRENT_SONG, JSON.stringify(nextSong));
    
    const playback: PlaybackState = {
      isPlaying: true,
      progress: 0,
      lastUpdated: Date.now()
    };
    await redis.set(KEY_PLAYBACK, JSON.stringify(playback));
    
    return { currentSong: nextSong, playback, queue };
  } else {
    // Clear out current playback as playlist ended
    await redis.del(KEY_CURRENT_SONG);
    const playback = await setPlaybackState(false, 0);
    return { currentSong: null, playback, queue };
  }
}
