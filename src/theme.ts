export const colors = {
  // Surfaces.
  chalkboard: '#44534B', // sage chalkboard green — fallback behind the board image
  chalk: '#EFEBDD', // chalk white — text written straight on the board
  bg: '#FAF3E0', // soft paper tint for subtle in-card surfaces / pressed states
  card: '#FFFDF7', // index-card warm white (card front)
  cardBack: '#F2F1EF', // a hair cooler/darker than the front — a faint shadow on the answer side
  paper: '#FCFCFA', // white notebook page (a whisper of warmth) — the backdrop inside a deck (vs. the chalkboard)
  paperLine: '#C7D8EC', // ruled horizontal line (light blue) on a card / the paper page
  marginLine: '#E5A2AB', // red/pink margin rule on a card / the paper page
  border: '#E6DCC4', // soft tan card/input border
  // Sticky notes — flashcards inside a deck read as classic yellow Post-Its.
  postit: '#FBEA7E', // pale canary Post-It yellow (kept distinct from the gold `primary` pencil yellow)
  postitBack: '#E8D15A', // the answer (flip-back) side: the same canary in shadow — darker, still yellow (not greenish)
  postitEdge: '#E7D45F', // faint warm edge that defines a Post-It on the cream page
  // Ink.
  text: '#39362F', // graphite
  textMuted: '#9C9385', // warm gray
  // Brand — the Ticonderoga #2 pencil.
  primary: '#F3C53D', // pencil yellow
  primaryText: '#39362F', // graphite text on yellow
  ferrule: '#3E8E72', // green pencil band — links / "due" accent
  eraser: '#F2A7A7', // pink eraser accent
  danger: '#D98B85', // muted coral (destructive)
  good: '#8FB8DE', // pastel blue — the middle "Good" rating
  // Familiarity level colors (pastel red → green progression).
  hard: '#E08A86', // new / lapsed
  mid: '#EAB45E', // 1–2
  fine: '#A7C56C', // 3–4
  easy: '#7FB069', // 5+ (mature)
} as const;

// Composition-notebook cover colors, assigned per deck. Vibrant, saturated tones
// that read as marbled covers under the white speckle texture and a white label.
export const deckCoverColors = [
  '#262629', // classic slate/black
  '#2C5FB0', // blue
  '#C23B3B', // red
  '#2E8B57', // green
  '#7A4FB5', // purple
  '#1C9C9C', // teal
  '#9C7012', // mustard — deepened so the yellow pencil stays distinct
  '#27408B', // navy
  '#A12B47', // maroon
  '#A8431D', // rust — deepened so the yellow pencil stays distinct
  '#6A2E8A', // plum
  '#3C8C3C', // forest
  '#A6651A', // ochre — deepened so the yellow pencil stays distinct
] as const;

/**
 * Reseed knob for the deck cover palette: mixed into the hash below so bumping it
 * reshuffles every deck's cover color wholesale, while each deck stays stable for
 * a given value. Bump to any new 32-bit constant to reseed again.
 */
const COVER_SEED = 0x1802462e;

/**
 * Stable cover color for a deck — hashed from its id (and COVER_SEED) so it never
 * shifts. Uses an avalanche mix (not a plain multiply-mod, which maps consecutive
 * ids to a short repeating cycle) so neighboring decks land on visibly different
 * colors.
 */
export function deckCoverColor(id: number): string {
  let h = (Math.abs(id) | 0) ^ COVER_SEED;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return deckCoverColors[h % deckCoverColors.length];
}

/**
 * Color for a card's familiarity badge, ramping muted → orange → green as the
 * level climbs (0 = new/lapsed, up through the mature end of the Leitner ladder).
 */
export function levelColor(familiarity: number): string {
  if (familiarity <= 0) return colors.textMuted; // new / lapsed
  if (familiarity <= 2) return colors.mid; // 1–2
  if (familiarity <= 4) return colors.fine; // 3–4
  return colors.easy; // 5+ (mature)
}

/**
 * Font families loaded in the root layout. Custom fonts ignore `fontWeight`, so
 * bold text must use the matching named family (e.g. `bodyBold`) rather than a
 * weight. `heading` is the handwritten Patrick Hand (titles, deck names, card
 * faces); the `body*` Nunito family covers UI, meta, inputs, and badges.
 */
export const fonts = {
  heading: 'PatrickHand_400Regular',
  body: 'Nunito_400Regular',
  bodyMedium: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyExtra: 'Nunito_800ExtraBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Soft drop shadow that lifts index cards off the ruled page. */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
