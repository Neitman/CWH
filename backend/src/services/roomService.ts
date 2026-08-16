import { query } from '../db';
import redis from '../config/redis';

export interface UserRoom {
  id: number;
  room_id: string;
  name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  owner_username?: string;
}

// Generate random room code (room-xxxxxx) if not provided
function generateRoomCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'room-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createRoom(
  userId: number,
  name: string,
  description?: string,
  customRoomId?: string
): Promise<UserRoom> {
  const roomId = (customRoomId && customRoomId.trim()) 
    ? customRoomId.trim().toLowerCase() 
    : generateRoomCode();

  const roomName = (name && name.trim()) ? name.trim() : `Room ${roomId}`;
  const roomDesc = description ? description.trim() : null;

  const result = await query(
    `INSERT INTO user_rooms (room_id, name, description, user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, room_id, name, description, user_id, created_at, updated_at`,
    [roomId, roomName, roomDesc, userId]
  );

  return result.rows[0];
}

export async function getUserRooms(userId: number): Promise<UserRoom[]> {
  const result = await query(
    `SELECT id, room_id, name, description, user_id, created_at, updated_at
     FROM user_rooms
     WHERE user_id = $1
     ORDER BY updated_at DESC, id DESC`,
    [userId]
  );

  return result.rows;
}

export async function updateRoom(
  userId: number,
  id: number,
  name: string,
  description?: string
): Promise<UserRoom | null> {
  const roomName = name.trim();
  const roomDesc = description ? description.trim() : null;

  const result = await query(
    `UPDATE user_rooms
     SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND user_id = $4
     RETURNING id, room_id, name, description, user_id, created_at, updated_at`,
    [roomName, roomDesc, id, userId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function deleteRoom(userId: number, id: number): Promise<boolean> {
  // First fetch room_id to cleanup Redis & discussion messages
  const roomRes = await query(
    `SELECT room_id FROM user_rooms WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (roomRes.rows.length === 0) return false;
  const roomId = roomRes.rows[0].room_id;

  // Delete from PostgreSQL
  await query(`DELETE FROM user_rooms WHERE id = $1 AND user_id = $2`, [id, userId]);

  // Clean up discussion messages
  await query(`DELETE FROM discussion_messages WHERE room_id = $1`, [roomId]);

  // Clean up Redis keys for this room
  try {
    await redis.del(`wp:${roomId}:playlist`);
    await redis.del(`wp:${roomId}:current_song`);
    await redis.del(`wp:${roomId}:playback`);
    await redis.del(`wp:${roomId}:host`);
    await redis.del(`wp:${roomId}:write_permissions`);
  } catch (err) {
    console.error(`Failed to clean up Redis keys for room ${roomId}:`, err);
  }

  return true;
}

export async function getRoomByCode(roomId: string): Promise<UserRoom | null> {
  const cleanRoomId = roomId.trim().toLowerCase();
  const result = await query(
    `SELECT r.id, r.room_id, r.name, r.description, r.user_id, r.created_at, r.updated_at, u.username as owner_username
     FROM user_rooms r
     JOIN users u ON r.user_id = u.id
     WHERE r.room_id = $1`,
    [cleanRoomId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}
