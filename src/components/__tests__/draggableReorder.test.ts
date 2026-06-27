/**
 * Unit tests for the pure reindex helpers behind the drag-to-reorder deck list.
 * The Reanimated/gesture interaction isn't exercised here — these cover the
 * id -> slot bookkeeping that decides the order `onReorder` ultimately persists.
 */
import { objectMove, orderOf } from '@/components/deckReorder';

// Build the identity positions map for `count` decks (id N at slot N).
function identity(count: number): Record<number, number> {
  const map: Record<number, number> = {};
  for (let i = 0; i < count; i++) map[i] = i;
  return map;
}

describe('objectMove', () => {
  it('moving down shifts the in-between rows up by one', () => {
    // [0,1,2,3,4], drag id 1 down to slot 3 -> visible order [0,2,3,1,4].
    expect(objectMove(identity(5), 1, 3)).toEqual({ 0: 0, 1: 3, 2: 1, 3: 2, 4: 4 });
  });

  it('moving up shifts the in-between rows down by one', () => {
    // [0,1,2,3,4], drag id 3 up to slot 1 -> visible order [0,3,1,2,4].
    expect(objectMove(identity(5), 3, 1)).toEqual({ 0: 0, 1: 2, 2: 3, 3: 1, 4: 4 });
  });

  it('a no-op move leaves every position unchanged', () => {
    expect(objectMove(identity(4), 2, 2)).toEqual(identity(4));
  });

  it('moves the first row to the last slot', () => {
    expect(objectMove(identity(4), 0, 3)).toEqual({ 0: 3, 1: 0, 2: 1, 3: 2 });
  });

  it('moves the last row to the first slot', () => {
    expect(objectMove(identity(4), 3, 0)).toEqual({ 0: 1, 1: 2, 2: 3, 3: 0 });
  });

  it('does not mutate the input map', () => {
    const before = identity(3);
    objectMove(before, 0, 2);
    expect(before).toEqual(identity(3));
  });
});

describe('orderOf', () => {
  it('flattens a positions map into a top-to-bottom id list', () => {
    // ids 10/20/30 sitting at slots 2/0/1 -> top-to-bottom [20, 30, 10].
    expect(orderOf({ 10: 2, 20: 0, 30: 1 }, 3)).toEqual([20, 30, 10]);
  });

  it('round-trips the identity map back to ascending ids', () => {
    expect(orderOf(identity(5), 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('composes with objectMove to yield the final persisted order', () => {
    // Drag id 0 down to slot 3, then read the visible order that onReorder gets.
    const moved = objectMove(identity(5), 0, 3);
    expect(orderOf(moved, 5)).toEqual([1, 2, 3, 0, 4]);
  });
});
