import { INTERVAL_DAYS, MAX_LEVEL, nextReview } from '@/db/cards';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('nextReview (Leitner spaced-repetition ladder)', () => {
  const now = 1_700_000_000_000;

  it('advances a new card one level on "fine", due 1 day out', () => {
    const r = nextReview('fine', 0, now);
    expect(r.familiarity).toBe(1);
    expect(r.due_at).toBe(now + 1 * DAY_MS);
  });

  it('walks the ladder 1→3→7→14→30→60 days on repeated "fine"', () => {
    const expectedDays = [1, 3, 7, 14, 30, 60];
    let familiarity = 0;
    for (const days of expectedDays) {
      const r = nextReview('fine', familiarity, now);
      expect(r.due_at).toBe(now + days * DAY_MS);
      familiarity = r.familiarity;
    }
    expect(familiarity).toBe(MAX_LEVEL); // 6
  });

  it('jumps two levels on "easy"', () => {
    const r = nextReview('easy', 0, now);
    expect(r.familiarity).toBe(2);
    expect(r.due_at).toBe(now + INTERVAL_DAYS[2] * DAY_MS); // 3 days
  });

  it('"hard" resets to level 0 and due now', () => {
    const r = nextReview('hard', 5, now);
    expect(r.familiarity).toBe(0);
    expect(r.due_at).toBe(now);
  });

  it('clamps at MAX_LEVEL (60 days) and never goes below 0', () => {
    const top = nextReview('easy', MAX_LEVEL, now);
    expect(top.familiarity).toBe(MAX_LEVEL);
    expect(top.due_at).toBe(now + INTERVAL_DAYS[MAX_LEVEL] * DAY_MS); // 60 days

    const bottom = nextReview('hard', 0, now);
    expect(bottom.familiarity).toBe(0);
  });
});
