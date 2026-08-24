import { query } from '../config/db';

export interface DiscussionMessage {
  id: number;
  room_id: string;
  user_id: number | null;
  username: string;
  message: string;
  video_timestamp: number | null;
  created_at: string;
}

export const getDiscussionMessagesByRoomId = async (roomId: string, limit = 50): Promise<DiscussionMessage[]> => {
  const res = await query(
    'SELECT * FROM discussion_messages WHERE room_id = $1 ORDER BY id DESC LIMIT $2',
    [roomId, limit]
  );
  return res.rows.reverse();
};

export const createDiscussionMessage = async (
  roomId: string,
  userId: number | null,
  username: string,
  message: string,
  videoTimestamp?: number | null
): Promise<DiscussionMessage> => {
  const res = await query(
    'INSERT INTO discussion_messages (room_id, user_id, username, message, video_timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [roomId, userId, username, message, videoTimestamp ?? null]
  );
  return res.rows[0];
};
