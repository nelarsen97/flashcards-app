import { getDb } from './database';

export interface Deck {
  id: number;
  name: string;
  created_at: number;
}

/** A deck plus the counts shown on the decks list. */
export interface DeckWithCounts extends Deck {
  total: number;
  /** Cards currently due for practice (due_at <= now). */
  due: number;
}

export async function listDecksWithCounts(): Promise<DeckWithCounts[]> {
  const db = await getDb();
  const now = Date.now();
  return db.getAllAsync<DeckWithCounts>(
    `SELECT d.id, d.name, d.created_at,
            COUNT(c.id) AS total,
            COALESCE(SUM(CASE WHEN c.due_at <= ? THEN 1 ELSE 0 END), 0) AS due
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC`,
    now
  );
}

export async function getDeck(id: number): Promise<Deck | null> {
  const db = await getDb();
  return db.getFirstAsync<Deck>('SELECT * FROM decks WHERE id = ?', id);
}

export async function createDeck(name: string): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO decks (name, created_at) VALUES (?, ?)',
    name.trim(),
    Date.now()
  );
  return result.lastInsertRowId;
}

export async function renameDeck(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE decks SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteDeck(id: number): Promise<void> {
  const db = await getDb();
  // Cards are removed via ON DELETE CASCADE (foreign_keys pragma is on).
  await db.runAsync('DELETE FROM decks WHERE id = ?', id);
}
