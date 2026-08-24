import { query } from '../config/db';
import { User } from '../types/user';

export const findUserByUsername = async (username: string): Promise<User | null> => {
  const res = await query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return res.rows[0] || null;
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  const res = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  return res.rows[0] || null;
};

export const findUserById = async (id: number): Promise<User | null> => {
  const res = await query('SELECT id, username, email, display_name, avatar_url, created_at FROM users WHERE id = $1', [id]);
  return res.rows[0] || null;
};

export const createUser = async (username: string, passwordHash: string, email?: string, displayName?: string): Promise<User> => {
  const res = await query(
    'INSERT INTO users (username, password, email, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, display_name, avatar_url, created_at',
    [username, passwordHash, email || null, displayName || username]
  );
  return res.rows[0];
};

export const updateUserPassword = async (id: number, passwordHash: string): Promise<void> => {
  await query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, id]);
};

export const updateUserProfile = async (id: number, displayName?: string, avatarUrl?: string): Promise<User> => {
  const fields: string[] = [];
  const values: any[] = [];
  let index = 1;

  if (displayName !== undefined) {
    fields.push(`display_name = $${index++}`);
    values.push(displayName);
  }
  if (avatarUrl !== undefined) {
    fields.push(`avatar_url = $${index++}`);
    values.push(avatarUrl);
  }

  if (fields.length === 0) {
    const existing = await findUserById(id);
    if (!existing) throw new Error('User not found');
    return existing;
  }

  values.push(id);
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING id, username, email, display_name, avatar_url, created_at`;
  const res = await query(sql, values);
  return res.rows[0];
};

export const getAllUsers = async (): Promise<User[]> => {
  const res = await query('SELECT id, username, email, display_name, avatar_url, created_at FROM users ORDER BY id DESC');
  return res.rows;
};

export const deleteUserById = async (id: number): Promise<void> => {
  await query('DELETE FROM users WHERE id = $1', [id]);
};

export const getUserCount = async (): Promise<number> => {
  const res = await query('SELECT COUNT(*) FROM users');
  return parseInt(res.rows[0].count || '0', 10);
};
