import { Card, LEVEL_GROUPS, LevelGroup } from '@/db/cards';

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

/** Review status a card can be filtered by. */
export type CardStatus = 'all' | 'due' | 'learned';

export interface CardFilters {
  /** Live search text, matched against the front/back (see filterCards). */
  query: string;
  /** Keep all cards, only those due now, or only the learned ones. */
  status: CardStatus;
  /** Familiarity group to keep, or null for any level. */
  group: LevelGroup | null;
  /** Reference time (epoch ms) for the due/learned split. */
  now: number;
}

/**
 * Narrows a deck's cards by the deck view's three combinable filters — search
 * text, review status, and familiarity group (AND semantics). Reuses
 * `filterCards` for the text match.
 */
export function applyCardFilters(cards: Card[], f: CardFilters): Card[] {
  let out = filterCards(cards, f.query);
  if (f.status !== 'all') {
    out = out.filter((c) => (f.status === 'due' ? c.due_at <= f.now : c.due_at > f.now));
  }
  if (f.group) {
    const g = LEVEL_GROUPS.find((x) => x.key === f.group);
    if (g) out = out.filter((c) => c.familiarity >= g.min && c.familiarity <= g.max);
  }
  return out;
}
