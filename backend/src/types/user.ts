export interface User {
  id: number;
  username: string;
  password?: string;
  email?: string;
  avatar_url?: string;
  display_name?: string;
  created_at?: Date | string;
}

export interface UserTokenPayload {
  id: number;
  username: string;
  displayName?: string;
  email?: string;
}
