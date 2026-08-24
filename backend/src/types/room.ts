export interface PlaybackState {
  isPlaying: boolean;
  progress: number;
  lastUpdated: number;
}

export interface SongItem {
  id: string;
  song_id: string;
  title: string;
  thumbnail?: string;
  channel_title?: string;
  duration?: number;
}

export interface RoomDetails {
  roomId: string;
  name?: string;
  description?: string;
  queueLength: number;
  currentSong: SongItem | null;
  playback: PlaybackState;
  listenersCount: number;
  members: string[];
}
