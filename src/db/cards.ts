import { getDb } from './database';

export interface Card {
  id: number;
  deck_id: number;
  front: string;
  back: string;
  /**
   * Familiarity "box" (Leitner level). 0 = new/lapsed (due now); each successful
   * recall climbs the ladder for a longer interval. See INTERVAL_DAYS.
   */
  familiarity: number;
  /** Epoch ms after which the card is "learned". A card is due when due_at <= now. */
  due_at: number;
  created_at: number;
}

/**
 * The rating a user assigns to a card during practice (the four buttons). It moves
 * the card's familiarity level, which in turn picks the next review interval.
 */
export type Rating = 'hard' | 'fine' | 'easy';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Leitner interval ladder, in days, indexed by familiarity level. Level 0 means
 * the card is due immediately (new or just lapsed); each successful recall climbs
 * the ladder for a longer gap, capped at MAX_LEVEL (60 days).
 */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60] as const;
export const MAX_LEVEL = INTERVAL_DAYS.length - 1; // 6 → 60 days

export interface ReviewResult {
  familiarity: number;
  due_at: number;
}

/**
 * Given a rating and the card's current familiarity, returns the card's next
 * familiarity level and due_at. Pure (takes `now`), so it's unit-testable.
 *
 * - hard:  forgot — reset to level 0, stays due now (relearn from scratch).
 * - fine:  recalled — advance one level, scheduled out by the ladder.
 * - easy:  easy — advance two levels, scheduled out by the ladder.
 *
 * (To keep a card in the set without changing its level, the user swipes past it
 * instead of rating — that leaves familiarity and due_at untouched.)
 */
export function nextReview(rating: Rating, familiarity: number, now: number): ReviewResult {
  let next: number;
  switch (rating) {
    case 'hard':
      next = 0;
      break;
    case 'fine':
      next = familiarity + 1;
      break;
    case 'easy':
      next = familiarity + 2;
      break;
  }
  next = Math.min(MAX_LEVEL, Math.max(0, next));
  // Hard keeps the card due now so it stays in the practice set; Fine/Easy push it
  // out by the ladder interval for the new level.
  const due_at = rating === 'hard' ? now : now + INTERVAL_DAYS[next] * DAY_MS;
  return { familiarity: next, due_at };
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

/** Up to `limit` due cards for a practice batch, randomized so each session
 * draws a different set rather than always marching through the deck in order. */
export async function getDueCards(deckId: number, limit: number): Promise<Card[]> {
  const db = await getDb();
  return db.getAllAsync<Card>(
    'SELECT * FROM cards WHERE deck_id = ? AND due_at <= ? ORDER BY RANDOM() LIMIT ?',
    deckId,
    Date.now(),
    limit
  );
}

/**
 * Apply a rating to a card, updating its familiarity level and due_at.
 *
 * `baselineFamiliarity` lets the caller rate against a known starting level
 * instead of the card's current DB value. Practice uses this so re-rating a card
 * (after swiping back to it) recomputes from the card's *original* level rather
 * than compounding on the rating left behind by the earlier press. Omit it to
 * rate against the current stored level.
 */
export async function rateCard(
  id: number,
  rating: Rating,
  baselineFamiliarity?: number
): Promise<void> {
  const db = await getDb();
  let baseline = baselineFamiliarity;
  if (baseline === undefined) {
    const card = await db.getFirstAsync<{ familiarity: number }>(
      'SELECT familiarity FROM cards WHERE id = ?',
      id
    );
    if (!card) return;
    baseline = card.familiarity;
  }
  const { familiarity, due_at } = nextReview(rating, baseline, Date.now());
  await db.runAsync(
    'UPDATE cards SET familiarity = ?, due_at = ? WHERE id = ?',
    familiarity,
    due_at,
    id
  );
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
