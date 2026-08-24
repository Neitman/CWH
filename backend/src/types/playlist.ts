export interface UserPlaylist {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  item_count?: number;
}

export interface UserPlaylistItem {
  id: number;
  playlist_id: number;
  song_id: string;
  title: string;
  thumbnail?: string;
  channel_title?: string;
  duration?: number;
  position?: number;
  added_at?: string;
}
