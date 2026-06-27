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

/**
 * Restore from a backup file's text. Decks are *appended* (new decks are
 * created) so an existing library is never clobbered. Card due/created state is
 * preserved. Throws if the text is not a valid backup.
 */
export async function importFromText(text: string): Promise<BackupCounts> {
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!data || !Array.isArray(data.decks)) {
    throw new Error('Not a flashcards backup file.');
  }

  const db = await getDb();
  const now = Date.now();
  let deckCount = 0;
  let cardCount = 0;

  await db.withTransactionAsync(async () => {
    for (const deck of data.decks) {
      if (!deck || typeof deck.name !== 'string') continue;
      // Append imported decks after any existing ones, preserving file order.
      const res = await db.runAsync(
        `INSERT INTO decks (name, created_at, position)
         VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM decks))`,
        deck.name.trim() || 'Imported deck',
        typeof deck.created_at === 'number' ? deck.created_at : now
      );
      const deckId = res.lastInsertRowId;
      deckCount++;

      const cards = Array.isArray(deck.cards) ? deck.cards : [];
      for (const c of cards) {
        if (!c || typeof c.front !== 'string' || typeof c.back !== 'string') continue;
        await db.runAsync(
          'INSERT INTO cards (deck_id, front, back, familiarity, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          deckId,
          c.front,
          c.back,
          typeof c.familiarity === 'number' ? c.familiarity : 0,
          typeof c.due_at === 'number' ? c.due_at : 0,
          typeof c.created_at === 'number' ? c.created_at : now
        );
        cardCount++;
      }
    }
  });

  return { deckCount, cardCount };
}
