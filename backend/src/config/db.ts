import { Pool } from 'pg';
import { config } from './env';

const pool = new Pool({
  host: config.pg.host,
  port: config.pg.port,
  user: config.pg.user,
  password: config.pg.password,
  database: config.pg.database,
});

pool.on('connect', (client) => {
  client.query("SET TIMEZONE = 'Asia/Ho_Chi_Minh';").catch(() => {});
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export const initDb = async () => {
  const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL successfully.');
    await client.query(createUserTableQuery);

    // Migrations for user columns
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100) UNIQUE;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);');

    // Playlists Tables
    const createPlaylistsTableQuery = `
      CREATE TABLE IF NOT EXISTS user_playlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createPlaylistsTableQuery);

    const createPlaylistItemsTableQuery = `
      CREATE TABLE IF NOT EXISTS user_playlist_items (
        id SERIAL PRIMARY KEY,
        playlist_id INTEGER NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
        song_id VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        thumbnail TEXT,
        channel_title VARCHAR(255),
        duration INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createPlaylistItemsTableQuery);

    // Discussion Messages Table
    const createDiscussionMessagesTableQuery = `
      CREATE TABLE IF NOT EXISTS discussion_messages (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        video_timestamp INTEGER DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createDiscussionMessagesTableQuery);

    // User Rooms Table
    const createRoomsTableQuery = `
      CREATE TABLE IF NOT EXISTS user_rooms (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createRoomsTableQuery);

    client.release();
    console.log('Database tables and migrations initialized.');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL or run initial migrations:', error);
    process.exit(1);
  }
};

export default pool;
