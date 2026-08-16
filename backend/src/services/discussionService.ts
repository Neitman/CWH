import { query } from '../db';

export interface DiscussionMessage {
  id: number;
  roomId: string;
  userId: number | null;
  username: string;
  message: string;
  videoTimestamp: number | null;
  createdAt: string;
}

/**
 * Save a new discussion message for a room
 */
export const saveDiscussionMessage = async (
  roomId: string,
  userId: number | null,
  username: string,
  message: string,
  videoTimestamp: number | null = null
): Promise<DiscussionMessage> => {
  const result = await query(
    `INSERT INTO discussion_messages (room_id, user_id, username, message, video_timestamp)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, room_id as "roomId", user_id as "userId", username, message, video_timestamp as "videoTimestamp", created_at as "createdAt"`,
    [roomId, userId, username, message, videoTimestamp]
  );
  return result.rows[0];
};

/**
 * Get recent discussion messages for a room (default limit 100)
 */
export const getRecentDiscussionMessages = async (
  roomId: string,
  limit: number = 100
): Promise<DiscussionMessage[]> => {
  const result = await query(
    `SELECT id, room_id as "roomId", user_id as "userId", username, message, video_timestamp as "videoTimestamp", created_at as "createdAt"
     FROM discussion_messages
     WHERE room_id = $1
     ORDER BY id ASC
     LIMIT $2`,
    [roomId, limit]
  );
  return result.rows;
};

/**
 * Clear discussion history for a room (Host administrative feature)
 */
export const clearDiscussionMessages = async (roomId: string): Promise<void> => {
  await query(`DELETE FROM discussion_messages WHERE room_id = $1`, [roomId]);
};
