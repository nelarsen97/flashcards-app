export const colors = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  border: '#E2E4E9',
  text: '#1A1C1E',
  textMuted: '#6B7078',
  primary: '#2F6FED',
  primaryText: '#FFFFFF',
  danger: '#D6453D',
  // Familiarity level colors (red → green progression)
  hard: '#D6453D',
  mid: '#E08C12',
  fine: '#6E9A1F',
  easy: '#1F9D55',
} as const;

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
} as const;
