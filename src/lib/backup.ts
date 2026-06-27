import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db/database';

/**
 * Whole-database backup/restore. This is the only persistence method that
 * survives a full uninstall or a move to a new device: the export is written to
 * a file and handed to the OS share sheet, so the user can store it outside the
 * app sandbox (Drive, Downloads, email, ...). Restore re-imports that file.
 */

const BACKUP_VERSION = 2;

interface BackupCard {
  front: string;
  back: string;
  familiarity: number;
  due_at: number;
  created_at: number;
}
interface BackupDeck {
  name: string;
  created_at: number;
  cards: BackupCard[];
}
interface BackupFile {
  version: number;
  exportedAt: number;
  decks: BackupDeck[];
}

export interface BackupCounts {
  deckCount: number;
  cardCount: number;
}

/** Serialize every deck + card to a JSON file in the cache dir. Returns its URI. */
export async function exportAllToFile(): Promise<BackupCounts & { uri: string }> {
  const db = await getDb();
  const decks = await db.getAllAsync<{ id: number; name: string; created_at: number }>(
    'SELECT id, name, created_at FROM decks ORDER BY position ASC, id ASC'
  );

  const out: BackupDeck[] = [];
  let cardCount = 0;
  for (const d of decks) {
    const cards = await db.getAllAsync<BackupCard>(
      'SELECT front, back, familiarity, due_at, created_at FROM cards WHERE deck_id = ? ORDER BY created_at ASC',
      d.id
    );
    cardCount += cards.length;
    out.push({ name: d.name, created_at: d.created_at, cards });
  }

  const payload: BackupFile = { version: BACKUP_VERSION, exportedAt: Date.now(), decks: out };

  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `flashcards-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));

  return { uri: file.uri, deckCount: decks.length, cardCount };
}

/** Present the OS share sheet so the user can save the backup file somewhere durable. */
export async function shareBackup(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save flashcards backup',
  });
  return true;
}

interface NormalizedCard {
  front: string;
  back: string;
  familiarity: number;
  due_at: number;
  created_at: number;
}
interface NormalizedDeck {
  name: string;
  created_at: number;
  cards: NormalizedCard[];
}

/**
 * Coerce the loosely-typed decks from a parsed backup file into clean,
 * fully-resolved rows, dropping anything malformed (a non-object deck, a deck
 * with a non-string name, a card missing its front/back). Runs entirely in
 * memory *before* the DB is touched, so a bad file is rejected without ever
 * deleting the existing library. `now` fills in any missing timestamps.
 */
function normalizeDecks(rawDecks: unknown[], now: number): NormalizedDeck[] {
  const out: NormalizedDeck[] = [];
  for (const raw of rawDecks) {
    if (!raw || typeof raw !== 'object') continue;
    const deck = raw as Partial<BackupDeck>;
    if (typeof deck.name !== 'string') continue;

    const rawCards = Array.isArray(deck.cards) ? deck.cards : [];
    const cards: NormalizedCard[] = [];
    for (const c of rawCards) {
      if (!c || typeof c.front !== 'string' || typeof c.back !== 'string') continue;
      cards.push({
        front: c.front,
        back: c.back,
        familiarity: typeof c.familiarity === 'number' ? c.familiarity : 0,
        due_at: typeof c.due_at === 'number' ? c.due_at : 0,
        created_at: typeof c.created_at === 'number' ? c.created_at : now,
      });
    }
    out.push({
      name: deck.name.trim() || 'Imported deck',
      created_at: typeof deck.created_at === 'number' ? deck.created_at : now,
      cards,
    });
  }
  return out;
}

/**
 * Restore from a backup file's text, **replacing the entire library**: the
 * existing decks and cards are wiped and the file's contents loaded in their
 * place (so restoring never duplicates what's already there).
 *
 * The replace is atomic and that atomicity is the fallback: the file is fully
 * parsed, version-checked, and normalized *before* anything is deleted, and the
 * wipe + reload run together in a single transaction. So if the import fails for
 * any reason — invalid JSON, an unrecognized/newer format, or an error part-way
 * through loading — it rolls back and the existing library is left exactly as it
 * was. The import never half-applies. Throws if the text is not a valid backup.
 */
export async function restoreFromText(text: string): Promise<BackupCounts> {
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!data || !Array.isArray(data.decks)) {
    throw new Error('Not a flashcards backup file.');
  }
  // Forward-compat guard: refuse a backup written by a newer app version whose
  // format we may not understand, rather than silently mis-importing it. A
  // missing or older version is fine (legacy files predate the field).
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app.');
  }

  const now = Date.now();
  // Normalize up front, before touching the DB, so a malformed file is rejected
  // (or its bad rows dropped) without any risk to the existing library.
  const decks = normalizeDecks(data.decks, now);

  const db = await getDb();
  let deckCount = 0;
  let cardCount = 0;

  await db.withTransactionAsync(async () => {
    // Replace, don't append: clear the library, then load the backup. The
    // transaction makes this atomic, so any failure below rolls the wipe back
    // too and the previous data survives. Delete cards first, then decks (rather
    // than leaning on ON DELETE CASCADE), so the order is explicit.
    await db.runAsync('DELETE FROM cards');
    await db.runAsync('DELETE FROM decks');

    for (const deck of decks) {
      const res = await db.runAsync(
        `INSERT INTO decks (name, created_at, position)
         VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM decks))`,
        deck.name,
        deck.created_at
      );
      const deckId = res.lastInsertRowId;
      deckCount++;

      for (const c of deck.cards) {
        await db.runAsync(
          'INSERT INTO cards (deck_id, front, back, familiarity, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          deckId,
          c.front,
          c.back,
          c.familiarity,
          c.due_at,
          c.created_at
        );
        cardCount++;
      }
    }
  });

  return { deckCount, cardCount };
}
