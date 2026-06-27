/**
 * Unit tests for the pure theme helpers: the per-deck cover-color hash and the
 * familiarity-level badge color. Asserts against the `colors`/`deckCoverColors`
 * tokens (not raw hex) so the tests track palette tweaks rather than break on
 * them, and stays agnostic to the exact `COVER_SEED` so a reseed doesn't fail it.
 */
import { colors, deckCoverColor, deckCoverColors, levelColor } from '@/theme';

describe('deckCoverColor', () => {
  it('always returns a color from the cover palette', () => {
    for (let id = 0; id < 50; id++) {
      expect(deckCoverColors).toContain(deckCoverColor(id));
    }
  });

  it('is stable for a given id', () => {
    for (const id of [1, 7, 42, 1000]) {
      expect(deckCoverColor(id)).toBe(deckCoverColor(id));
    }
  });

  it('handles negative ids without throwing and stays in palette', () => {
    expect(deckCoverColors).toContain(deckCoverColor(-1));
    expect(deckCoverColors).toContain(deckCoverColor(-12345));
  });

  it('spreads consecutive ids across multiple colors (avalanche mix)', () => {
    // The hash exists specifically so neighboring deck ids don't collapse onto a
    // short repeating cycle. Over one palette's worth of consecutive ids we
    // expect a healthy fraction of distinct colors, not just one or two.
    const seen = new Set<string>();
    for (let id = 1; id <= deckCoverColors.length; id++) {
      seen.add(deckCoverColor(id));
    }
    expect(seen.size).toBeGreaterThan(deckCoverColors.length / 2);
  });
});

describe('levelColor', () => {
  it('maps new / lapsed levels (<= 0) to the muted token', () => {
    expect(levelColor(0)).toBe(colors.textMuted);
    expect(levelColor(-1)).toBe(colors.textMuted);
  });

  it('maps the learning band (1-2) to mid', () => {
    expect(levelColor(1)).toBe(colors.mid);
    expect(levelColor(2)).toBe(colors.mid);
  });

  it('maps the familiar band (3-4) to fine', () => {
    expect(levelColor(3)).toBe(colors.fine);
    expect(levelColor(4)).toBe(colors.fine);
  });

  it('maps the mature band (>= 5) to easy', () => {
    expect(levelColor(5)).toBe(colors.easy);
    expect(levelColor(6)).toBe(colors.easy);
    expect(levelColor(99)).toBe(colors.easy);
  });
});
