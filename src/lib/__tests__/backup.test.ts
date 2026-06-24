/**
 * Tests for whole-database backup/restore. Runs against the in-memory
 * better-sqlite3 mock (expo-sqlite) and the in-memory expo-file-system mock.
 */
describe('backup import/export', () => {
  let backup: typeof import('@/lib/backup');
  let decks: typeof import('@/db/decks');
  let cards: typeof import('@/db/cards');

  beforeEach(() => {
    jest.resetModules();
    backup = require('@/lib/backup');
    decks = require('@/db/decks');
    cards = require('@/db/cards');
  });

  describe('importFromText validation', () => {
    it('rejects text that is not valid JSON', async () => {
      await expect(backup.importFromText('not json')).rejects.toThrow('Not valid JSON.');
    });

    it('rejects JSON that is not a backup file', async () => {
      await expect(backup.importFromText('{}')).rejects.toThrow('Not a flashcards backup file.');
      await expect(backup.importFromText('{"decks":"nope"}')).rejects.toThrow(
        'Not a flashcards backup file.'
      );
    });

    it('skips malformed decks and cards', async () => {
      const text = JSON.stringify({
        version: 1,
        decks: [
          null,
          { name: 42 }, // bad name -> skipped
          {
            name: 'Good',
            cards: [
              { front: 'a', back: '1' },
              { front: 'b' }, // missing back -> skipped
              null,
            ],
          },
        ],
      });
      const { deckCount, cardCount } = await backup.importFromText(text);
      expect(deckCount).toBe(1);
      expect(cardCount).toBe(1);
    });

    it('defaults a blank deck name to "Imported deck"', async () => {
      const text = JSON.stringify({ decks: [{ name: '   ', cards: [] }] });
      await backup.importFromText(text);
      const list = await decks.listDecksWithCounts();
      expect(list.map((d) => d.name)).toContain('Imported deck');
    });
  });

  it('appends decks without clobbering an existing library', async () => {
    const existing = await decks.createDeck('Existing');
    await cards.addCard(existing, 'keep', 'me');

    const text = JSON.stringify({ decks: [{ name: 'Imported', cards: [{ front: 'a', back: '1' }] }] });
    const { deckCount, cardCount } = await backup.importFromText(text);

    expect(deckCount).toBe(1);
    expect(cardCount).toBe(1);
    const names = (await decks.listDecksWithCounts()).map((d) => d.name).sort();
    expect(names).toEqual(['Existing', 'Imported']);
  });

  it('preserves due_at and created_at on restore', async () => {
    const dueAt = Date.now() + 5_000_000;
    const createdAt = 1_600_000_000_000;
    const text = JSON.stringify({
      decks: [{ name: 'D', created_at: createdAt, cards: [{ front: 'a', back: '1', due_at: dueAt, created_at: createdAt }] }],
    });
    await backup.importFromText(text);

    const deck = (await decks.listDecksWithCounts())[0];
    const card = (await cards.listCards(deck.id))[0];
    expect(card.due_at).toBe(dueAt);
    expect(card.created_at).toBe(createdAt);
    expect(deck.created_at).toBe(createdAt);
  });

  it('round-trips a library through export then import', async () => {
    const d1 = await decks.createDeck('Deck 1');
    const d2 = await decks.createDeck('Deck 2');
    await cards.addCard(d1, 'a', '1');
    await cards.addCard(d1, 'b', '2');
    await cards.addCard(d2, 'c', '3');

    const exported = await backup.exportAllToFile();
    expect(exported).toMatchObject({ deckCount: 2, cardCount: 3 });

    const { File } = require('expo-file-system');
    const text = await new File(exported.uri).text();

    // Re-import into a fresh DB to confirm the file fully describes the library.
    jest.resetModules();
    const backup2 = require('@/lib/backup');
    const { deckCount, cardCount } = await backup2.importFromText(text);
    expect(deckCount).toBe(2);
    expect(cardCount).toBe(3);
  });
});
