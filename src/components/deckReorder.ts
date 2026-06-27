/**
 * Pure reindex helpers for the drag-to-reorder deck list, split out from
 * `DraggableDeckList` so they can be unit-tested without pulling in Reanimated
 * (whose native init doesn't run under Jest). They keep the `'worklet'`
 * directive because the gesture handler calls them on the UI thread; invoked
 * directly on the JS thread (as in tests) they're plain functions.
 */

export type Positions = Record<number, number>;

// Move the entry at `from` to `to`, shifting everything in between by one — the
// classic sortable-list reindex. Returns a new mapping (id -> row index).
export function objectMove(positions: Positions, from: number, to: number): Positions {
  'worklet';
  const next: Positions = {};
  for (const key in positions) {
    const pos = positions[key];
    if (pos === from) next[key] = to;
    else if (from < to && pos > from && pos <= to) next[key] = pos - 1;
    else if (from > to && pos < from && pos >= to) next[key] = pos + 1;
    else next[key] = pos;
  }
  return next;
}

// Flatten a positions map back into a top-to-bottom list of deck ids.
export function orderOf(positions: Positions, count: number): number[] {
  'worklet';
  const order: number[] = new Array(count);
  for (const key in positions) {
    order[positions[key]] = Number(key);
  }
  return order;
}
