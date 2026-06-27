export const colors = {
  // Surfaces.
  chalkboard: '#36443C', // dark chalkboard green — the background behind everything
  chalkDust: 'rgba(255,255,255,0.07)', // faint chalk-dust flecks on the board
  chalk: '#EFEBDD', // chalk white — text written straight on the board
  bg: '#FAF3E0', // soft paper tint for subtle in-card surfaces / pressed states
  card: '#FFFDF7', // index-card warm white (card front)
  cardBack: '#F2F1EF', // a hair cooler/darker than the front — a faint shadow on the answer side
  paperLine: '#C7D8EC', // ruled horizontal line (light blue) on a card
  marginLine: '#E5A2AB', // red/pink margin rule on a card
  border: '#E6DCC4', // soft tan card/input border
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

// Composition-notebook cover colors, assigned per deck. Rich, slightly muted
// tones that read as marbled covers under a white speckle and a white label.
export const deckCoverColors = [
  '#3A3A3C', // classic slate/black
  '#3E5C8A', // blue
  '#9E4A4A', // red
  '#3E7C5A', // green
  '#6A5A8A', // purple
  '#3E7C7C', // teal
  '#A8843E', // mustard
] as const;

/** Stable cover color for a deck — hashed from its id so it never shifts. */
export function deckCoverColor(id: number): string {
  const hash = (Math.abs(id) * 2654435761) >>> 0;
  return deckCoverColors[hash % deckCoverColors.length];
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
