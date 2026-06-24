/**
 * Data-layer tests for cards, run against the in-memory better-sqlite3 mock of
 * expo-sqlite. `jest.resetModules()` in beforeEach gives every test a fresh,
 * schema-initialized database (a new `:memory:` connection per module re-import).
 */
describe('cards data layer', () => {
  let cards: typeof import('@/db/cards');
  let decks: typeof import('@/db/decks');
  let deckId: number;

  beforeEach(async () => {
    jest.resetModules();
    cards = require('@/db/cards');
    decks = require('@/db/decks');
    deckId = await decks.createDeck('Test deck');
  });

  it('addCard trims input and starts the card as due (due_at = 0)', async () => {
    const id = await cards.addCard(deckId, '  hund  ', '  dog  ');
    const card = await cards.getCard(id);
    expect(card).toMatchObject({ front: 'hund', back: 'dog', deck_id: deckId, due_at: 0 });
  });

  it('getCard returns null for a missing id', async () => {
    expect(await cards.getCard(99999)).toBeNull();
  });

  it('countDue counts only cards with due_at <= now', async () => {
    await cards.addCard(deckId, 'a', '1');
    await cards.addCard(deckId, 'b', '2');
    expect(await cards.countDue(deckId)).toBe(2);

    const cardList = await cards.listCards(deckId);
    await cards.rateCard(cardList[0].id, 'easy'); // pushed a week out
    expect(await cards.countDue(deckId)).toBe(1);
  });

  it('getDueCards returns only due cards and respects the limit', async () => {
    await cards.addCard(deckId, 'a', '1');
    await cards.addCard(deckId, 'b', '2');
    await cards.addCard(deckId, 'c', '3');

    const limited = await cards.getDueCards(deckId, 2);
    expect(limited).toHaveLength(2);

    const all = await cards.listCards(deckId);
    await cards.rateCard(all[0].id, 'fine'); // no longer due
    const due = await cards.getDueCards(deckId, 10);
    expect(due.map((c) => c.front).sort()).toEqual(['b', 'c']);
  });

  it('rateCard pushes due_at into the future so the card is no longer due', async () => {
    const id = await cards.addCard(deckId, 'a', '1');
    await cards.rateCard(id, 'close');
    const card = await cards.getCard(id);
    expect(card!.due_at).toBeGreaterThan(Date.now());
    expect(await cards.countDue(deckId)).toBe(0);
  });

  it('editCard updates and trims front/back', async () => {
    const id = await cards.addCard(deckId, 'a', '1');
    await cards.editCard(id, '  katt  ', '  cat  ');
    expect(await cards.getCard(id)).toMatchObject({ front: 'katt', back: 'cat' });
  });

  it('deleteCard removes the card', async () => {
    const id = await cards.addCard(deckId, 'a', '1');
    await cards.deleteCard(id);
    expect(await cards.getCard(id)).toBeNull();
  });

  it('moveCards reassigns cards to another deck, preserving them', async () => {
    const other = await decks.createDeck('Other');
    const id1 = await cards.addCard(deckId, 'a', '1');
    const id2 = await cards.addCard(deckId, 'b', '2');

    await cards.moveCards([id1, id2], other);

    expect(await cards.listCards(deckId)).toHaveLength(0);
    expect((await cards.listCards(other)).map((c) => c.front).sort()).toEqual(['a', 'b']);
  });

  it('moveCards is a no-op for an empty id list', async () => {
    await expect(cards.moveCards([], deckId)).resolves.toBeUndefined();
  });

  it('importCards bulk-inserts rows as due and returns the count', async () => {
    const n = await cards.importCards(deckId, [
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
    ]);
    expect(n).toBe(2);
    const list = await cards.listCards(deckId);
    expect(list).toHaveLength(2);
    expect(list.every((c) => c.due_at === 0)).toBe(true);
    expect(await cards.countDue(deckId)).toBe(2);
  });

  it('importCards returns 0 for an empty list', async () => {
    expect(await cards.importCards(deckId, [])).toBe(0);
  });
});
