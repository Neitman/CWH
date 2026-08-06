import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'cwh_user',
  password: process.env.PGPASSWORD || 'cwh_password',
  database: process.env.PGDATABASE || 'cwh',
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
    console.log('Table "users" checked/created successfully.');
    
    // Migration: ensure email column exists
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100) UNIQUE;');
    console.log('Column "email" verified/added successfully.');

    // User Playlists Tables
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
    console.log('Table "user_playlists" checked/created successfully.');

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
    console.log('Table "user_playlist_items" checked/created successfully.');
    
    client.release();
  } catch (error) {
    console.error('Failed to connect to PostgreSQL or run initial migrations:', error);
    process.exit(1); // Exit process if database is unavailable
  }
};

export default pool;
