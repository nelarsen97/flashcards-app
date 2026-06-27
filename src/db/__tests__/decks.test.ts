/**
 * Data-layer tests for decks against the in-memory better-sqlite3 mock.
 * Covers the decks-list LEFT JOIN counts and the ON DELETE CASCADE.
 */
describe('decks data layer', () => {
  let cards: typeof import('@/db/cards');
  let decks: typeof import('@/db/decks');

  beforeEach(() => {
    jest.resetModules();
    cards = require('@/db/cards');
    decks = require('@/db/decks');
  });

  it('createDeck trims the name and getDeck reads it back', async () => {
    const id = await decks.createDeck('  Spanish  ');
    expect(await decks.getDeck(id)).toMatchObject({ id, name: 'Spanish' });
  });

  it('getDeck returns null for a missing id', async () => {
    expect(await decks.getDeck(12345)).toBeNull();
  });

  it('renameDeck updates and trims the name', async () => {
    const id = await decks.createDeck('Old');
    await decks.renameDeck(id, '  New  ');
    expect((await decks.getDeck(id))!.name).toBe('New');
  });

  it('listDecksWithCounts reports total and due counts, including empty decks', async () => {
    const withCards = await decks.createDeck('A');
    const empty = await decks.createDeck('B');
    await cards.addCard(withCards, 'x', '1');
    await cards.addCard(withCards, 'y', '2');

    const list = await decks.listDecksWithCounts();
    const a = list.find((d) => d.id === withCards)!;
    const b = list.find((d) => d.id === empty)!;

    expect(a).toMatchObject({ total: 2, due: 2 });
    expect(b).toMatchObject({ total: 0, due: 0 });
  });

  it('due count excludes cards rated into the future', async () => {
    const id = await decks.createDeck('A');
    await cards.addCard(id, 'x', '1');
    await cards.addCard(id, 'y', '2');
    const list = await cards.listCards(id);
    await cards.rateCard(list[0].id, 'easy');

    const deck = (await decks.listDecksWithCounts()).find((d) => d.id === id)!;
    expect(deck).toMatchObject({ total: 2, due: 1 });
  });

  it('listDecksWithCounts appends new decks to the end of the manual order', async () => {
    await decks.createDeck('first');
    await decks.createDeck('second');

    const names = (await decks.listDecksWithCounts()).map((d) => d.name);
    expect(names.indexOf('first')).toBeLessThan(names.indexOf('second'));
  });

  it('reorderDecks persists a new top-to-bottom order', async () => {
    const a = await decks.createDeck('A');
    const b = await decks.createDeck('B');
    const c = await decks.createDeck('C');
    // Default (creation) order is A, B, C.
    expect((await decks.listDecksWithCounts()).map((d) => d.name)).toEqual(['A', 'B', 'C']);

    // Move C to the front, then A.
    await decks.reorderDecks([c, a, b]);
    expect((await decks.listDecksWithCounts()).map((d) => d.name)).toEqual(['C', 'A', 'B']);
  });

  it('deleteDeck cascades to its cards (foreign_keys = ON)', async () => {
    const id = await decks.createDeck('A');
    await cards.addCard(id, 'x', '1');
    await cards.addCard(id, 'y', '2');

    await decks.deleteDeck(id);

    expect(await decks.getDeck(id)).toBeNull();
    expect(await cards.listCards(id)).toHaveLength(0);
  });
});
