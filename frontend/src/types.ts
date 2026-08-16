export interface User {
  id: number;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
}

export interface UserRoom {
  id: number;
  user_id: number;
  room_id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface UserPlaylist {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  song_count?: number;
  created_at?: string;
}

export interface PlaylistItem {
  id?: number;
  video_id: string;
  title: string;
  channel_title?: string;
  thumbnail_url?: string;
  is_custom_file?: boolean;
  video_url?: string;
}

export interface DiscussionMessage {
  id: string;
  userId: number;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  message: string;
  timestampTag?: number;
  createdAt: string;
}
