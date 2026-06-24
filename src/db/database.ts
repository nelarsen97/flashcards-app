import * as SQLite from 'expo-sqlite';

const DB_NAME = 'flashcards.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Returns a shared, lazily-opened database connection. The schema is created on
 * first access, so every data-layer call can simply `await getDb()`.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS decks (
      id         INTEGER PRIMARY KEY NOT NULL,
      name       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id         INTEGER PRIMARY KEY NOT NULL,
      deck_id    INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      front      TEXT NOT NULL,
      back       TEXT NOT NULL,
      due_at     INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_deck_due ON cards(deck_id, due_at);
  `);
  return db;
}
