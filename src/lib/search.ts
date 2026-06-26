import { Card } from '@/db/cards';

/**
 * Narrows a deck's cards to those matching a search query, used by the deck
 * detail screen's live search box. Case-insensitive substring match over both
 * the front and back of each card. An empty or whitespace-only query returns
 * the cards unchanged (all shown).
 */
export function filterCards(cards: Card[], query: string): Card[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter(
    (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
  );
}
