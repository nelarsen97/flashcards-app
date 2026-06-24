import { getDb } from './database';

export interface Card {
  id: number;
  deck_id: number;
  front: string;
  back: string;
  /** Epoch ms after which the card is "learned". A card is due when due_at <= now. */
  due_at: number;
  created_at: number;
}

/**
 * The familiarity level a user assigns to a card during practice. Each level
 * controls how long the card is removed from the deck's "unlearned" set.
 */
export type FamiliarityLevel = 'hard' | 'close' | 'fine' | 'easy';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Maps a familiarity level to the next due_at, relative to `now`. Exported for unit tests. */
export function nextDueAt(level: FamiliarityLevel, now: number): number {
  switch (level) {
    case 'hard':
      return now; // stays due / unlearned
    case 'close':
      return now + DAY_MS; // removed for 1 day
    case 'fine':
      return now + 4 * DAY_MS; // removed for 4 days
    case 'easy':
      return now + WEEK_MS; // removed for 1 week
  }
}

export async function listCards(deckId: number): Promise<Card[]> {
  const db = await getDb();
  return db.getAllAsync<Card>(
    'SELECT * FROM cards WHERE deck_id = ? ORDER BY created_at ASC',
    deckId
  );
}

export async function getCard(id: number): Promise<Card | null> {
  const db = await getDb();
  return db.getFirstAsync<Card>('SELECT * FROM cards WHERE id = ?', id);
}

export async function addCard(deckId: number, front: string, back: string): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO cards (deck_id, front, back, due_at, created_at) VALUES (?, ?, ?, 0, ?)',
    deckId,
    front.trim(),
    back.trim(),
    Date.now()
  );
  return result.lastInsertRowId;
}

export async function editCard(id: number, front: string, back: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE cards SET front = ?, back = ? WHERE id = ?',
    front.trim(),
    back.trim(),
    id
  );
}

export async function deleteCard(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM cards WHERE id = ?', id);
}

/** Number of cards currently due (unlearned) in a deck. */
export async function countDue(deckId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM cards WHERE deck_id = ? AND due_at <= ?',
    deckId,
    Date.now()
  );
  return row?.n ?? 0;
}

/** Up to `limit` due cards for a practice batch, oldest-due first. */
export async function getDueCards(deckId: number, limit: number): Promise<Card[]> {
  const db = await getDb();
  return db.getAllAsync<Card>(
    'SELECT * FROM cards WHERE deck_id = ? AND due_at <= ? ORDER BY due_at ASC, created_at ASC LIMIT ?',
    deckId,
    Date.now(),
    limit
  );
}

/** Apply a familiarity level to a card, updating its due_at. */
export async function rateCard(id: number, level: FamiliarityLevel): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE cards SET due_at = ? WHERE id = ?', nextDueAt(level, Date.now()), id);
}

/** Re-assign a set of cards to another deck. Card learned/due state is preserved. */
export async function moveCards(cardIds: number[], targetDeckId: number): Promise<void> {
  if (cardIds.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const id of cardIds) {
      await db.runAsync('UPDATE cards SET deck_id = ? WHERE id = ?', targetDeckId, id);
    }
  });
}

/** Bulk-insert imported cards (all start as due/unlearned). Returns the count inserted. */
export async function importCards(
  deckId: number,
  rows: { front: string; back: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        'INSERT INTO cards (deck_id, front, back, due_at, created_at) VALUES (?, ?, ?, 0, ?)',
        deckId,
        row.front,
        row.back,
        now
      );
    }
  });
  return rows.length;
}
