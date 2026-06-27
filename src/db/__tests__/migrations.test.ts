/**
 * Tests the schema migrations in `src/db/database.ts` against a seeded legacy
 * database. The in-memory mock normally hands out a fresh DB per open; here we
 * pre-seed a connection with the pre-`familiarity` / pre-`position` schema (via
 * the mock's `__seedDb` seam) so `openAndMigrate` runs its `ALTER TABLE` paths
 * against real legacy data.
 */
const DB_NAME = 'flashcards.db';

type ColInfo = { name: string };

describe('database migrations', () => {
  afterEach(() => {
    const sqlite = require('expo-sqlite');
    sqlite.__resetDbs();
  });

  function seedLegacy() {
    jest.resetModules();
    const sqlite = require('expo-sqlite');
    const raw = sqlite.__seedDb(DB_NAME);
    // Legacy schema: decks without `position`, cards without `familiarity`.
    raw.exec(`
      CREATE TABLE decks (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE cards (
        id INTEGER PRIMARY KEY NOT NULL,
        deck_id INTEGER NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        due_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);
    // Decks span three creation times, with a tie at 200 to exercise the
    // id-based tie-break in the position backfill.
    raw.exec(`
      INSERT INTO decks (id, name, created_at) VALUES
        (1, 'A', 100),
        (2, 'B', 300),
        (3, 'C', 200),
        (4, 'D', 200);
      INSERT INTO cards (id, deck_id, front, back, due_at, created_at) VALUES
        (1, 1, 'q', 'a', 0, 100);
    `);
    return raw;
  }

  it('adds the familiarity column and defaults existing rows to 0', async () => {
    seedLegacy();
    const { getDb } = require('@/db/database') as typeof import('@/db/database');
    const db = await getDb();

    const cols = await db.getAllAsync<ColInfo>('PRAGMA table_info(cards)');
    expect(cols.map((c: ColInfo) => c.name)).toContain('familiarity');

    const card = await db.getFirstAsync<{ familiarity: number }>(
      'SELECT familiarity FROM cards WHERE id = 1'
    );
    expect(card!.familiarity).toBe(0);
  });

  it('adds position and backfills it from the legacy newest-first order', async () => {
    seedLegacy();
    const { getDb } = require('@/db/database') as typeof import('@/db/database');
    const db = await getDb();

    const cols = await db.getAllAsync<ColInfo>('PRAGMA table_info(decks)');
    expect(cols.map((c: ColInfo) => c.name)).toContain('position');

    // Newest created_at -> position 0; ties broken by higher id being "newer".
    // created_at: B=300, D=200(id4), C=200(id3), A=100 => order B, D, C, A.
    const ordered = await db.getAllAsync<{ name: string; position: number }>(
      'SELECT name, position FROM decks ORDER BY position'
    );
    expect(ordered.map((d: { name: string }) => d.name)).toEqual(['B', 'D', 'C', 'A']);
    expect(ordered.map((d: { position: number }) => d.position)).toEqual([0, 1, 2, 3]);
  });

  it('is a no-op on an already-current schema (fresh install)', async () => {
    // No seed: the mock hands out a fresh DB whose CREATE TABLE statements
    // already include both columns, so the ALTER branches must be skipped.
    jest.resetModules();
    const { getDb } = require('@/db/database') as typeof import('@/db/database');
    const db = await getDb();

    const cardCols = await db.getAllAsync<ColInfo>('PRAGMA table_info(cards)');
    const deckCols = await db.getAllAsync<ColInfo>('PRAGMA table_info(decks)');
    expect(cardCols.map((c: ColInfo) => c.name)).toContain('familiarity');
    expect(deckCols.map((c: ColInfo) => c.name)).toContain('position');
  });
});
