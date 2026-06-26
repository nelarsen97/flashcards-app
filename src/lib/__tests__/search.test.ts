import { Card } from '@/db/cards';
import { filterCards } from '@/lib/search';

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
