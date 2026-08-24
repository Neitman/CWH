import { query } from '../config/db';

export interface UserRoom {
  id: number;
  room_id: string;
  name: string;
  description?: string;
  user_id: number;
  created_at?: string;
  updated_at?: string;
}

export const createRoom = async (roomId: string, name: string, description: string | undefined, userId: number): Promise<UserRoom> => {
  const res = await query(
    'INSERT INTO user_rooms (room_id, name, description, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [roomId, name, description || null, userId]
  );
  return res.rows[0];
};

export const findRoomsByUserId = async (userId: number): Promise<UserRoom[]> => {
  const res = await query('SELECT * FROM user_rooms WHERE user_id = $1 ORDER BY updated_at DESC', [userId]);
  return res.rows;
};

export const findRoomByRoomId = async (roomId: string): Promise<UserRoom | null> => {
  const res = await query('SELECT * FROM user_rooms WHERE room_id = $1', [roomId]);
  return res.rows[0] || null;
};

export const deleteRoomByRoomId = async (roomId: string, userId: number): Promise<boolean> => {
  const res = await query('DELETE FROM user_rooms WHERE room_id = $1 AND user_id = $2 RETURNING id', [roomId, userId]);
  return (res.rowCount ?? 0) > 0;
};
