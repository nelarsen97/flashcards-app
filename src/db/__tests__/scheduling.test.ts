import { nextDueAt } from '@/db/cards';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

describe('nextDueAt (spaced-repetition intervals)', () => {
  const now = 1_700_000_000_000;

  it('keeps a "hard" card due immediately', () => {
    expect(nextDueAt('hard', now)).toBe(now);
  });

  it('removes a "close" card for 1 day', () => {
    expect(nextDueAt('close', now)).toBe(now + DAY_MS);
  });

  it('removes a "fine" card for 4 days', () => {
    expect(nextDueAt('fine', now)).toBe(now + 4 * DAY_MS);
  });

  it('removes an "easy" card for 1 week', () => {
    expect(nextDueAt('easy', now)).toBe(now + WEEK_MS);
  });

  it('orders the intervals hard < close < fine < easy', () => {
    expect(nextDueAt('hard', now)).toBeLessThan(nextDueAt('close', now));
    expect(nextDueAt('close', now)).toBeLessThan(nextDueAt('fine', now));
    expect(nextDueAt('fine', now)).toBeLessThan(nextDueAt('easy', now));
  });
});
