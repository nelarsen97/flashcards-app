import { Card } from '@/db/cards';
import { applyCardFilters, CardFilters, filterCards } from '@/lib/search';

function card(front: string, back: string, id = 1): Card {
  return { id, deck_id: 1, front, back, familiarity: 0, due_at: 0, created_at: 0 };
}

const cards: Card[] = [
  card('hund', 'dog', 1),
  card('katze', 'cat', 2),
  card('Vogel', 'bird', 3),
];

describe('filterCards', () => {
  it('returns all cards for an empty query', () => {
    expect(filterCards(cards, '')).toBe(cards);
  });

  it('returns all cards for a whitespace-only query', () => {
    expect(filterCards(cards, '   ')).toBe(cards);
  });

  it('matches on the front', () => {
    expect(filterCards(cards, 'hund')).toEqual([cards[0]]);
  });

  it('matches on the back', () => {
    expect(filterCards(cards, 'cat')).toEqual([cards[1]]);
  });

  it('matches case-insensitively', () => {
    expect(filterCards(cards, 'VOGEL')).toEqual([cards[2]]);
  });

  it('ignores leading/trailing whitespace in the query', () => {
    expect(filterCards(cards, '  dog  ')).toEqual([cards[0]]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterCards(cards, 'zzz')).toEqual([]);
  });
});

describe('applyCardFilters', () => {
  const NOW = 1_000;
  // id doubles as a readable label; familiarity/due_at chosen to span every bucket
  // and both sides of the due/learned split (due when due_at <= NOW).
  function c(id: number, familiarity: number, due_at: number): Card {
    return { id, deck_id: 1, front: `front ${id}`, back: `back ${id}`, familiarity, due_at, created_at: 0 };
  }

  const newDue = c(1, 0, 0); // New, due
  const learningDue = c(2, 2, NOW); // Learning, due (due_at == now)
  const familiarLearned = c(3, 4, NOW + 1); // Familiar, learned
  const matureLearned = c(4, 6, NOW + 10_000); // Mature, learned
  const all = [newDue, learningDue, familiarLearned, matureLearned];

  const base: CardFilters = { query: '', status: 'all', group: null, now: NOW };

  it('returns every card when no filter is active', () => {
    expect(applyCardFilters(all, base)).toEqual(all);
  });

  it('keeps only due cards', () => {
    expect(applyCardFilters(all, { ...base, status: 'due' })).toEqual([newDue, learningDue]);
  });

  it('keeps only learned cards', () => {
    expect(applyCardFilters(all, { ...base, status: 'learned' })).toEqual([
      familiarLearned,
      matureLearned,
    ]);
  });

  it('filters by the "new" group (level 0)', () => {
    expect(applyCardFilters(all, { ...base, group: 'new' })).toEqual([newDue]);
  });

  it('filters by the "learning" group (levels 1–2)', () => {
    expect(applyCardFilters(all, { ...base, group: 'learning' })).toEqual([learningDue]);
  });

  it('filters by the "familiar" group (levels 3–4)', () => {
    expect(applyCardFilters(all, { ...base, group: 'familiar' })).toEqual([familiarLearned]);
  });

  it('filters by the "mature" group (levels 5–6)', () => {
    expect(applyCardFilters(all, { ...base, group: 'mature' })).toEqual([matureLearned]);
  });

  it('combines query, status, and group with AND', () => {
    // Only "back 3" matches the text, is learned, and is in the familiar group.
    expect(
      applyCardFilters(all, { query: 'back 3', status: 'learned', group: 'familiar', now: NOW })
    ).toEqual([familiarLearned]);
  });

  it('returns an empty array when the combination excludes everything', () => {
    // A due card can never be in the mature group here (the only mature card is learned).
    expect(applyCardFilters(all, { ...base, status: 'due', group: 'mature' })).toEqual([]);
  });
});
