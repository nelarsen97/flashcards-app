import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import PracticeScreen from '@/app/deck/[id]/practice';
import { Card, editCard, getDueCards, rateCard } from '@/db/cards';

// expo-router: the screen reads the deck id from the route and only calls
// router.back() from the Done button, which these tests don't exercise.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '1' }),
  useRouter: () => ({ back: jest.fn() }),
  Stack: { Screen: () => null },
  __esModule: true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Reanimated/gesture-handler power the flip animation and swipe nav. Neither is
// under test here (we drive the session via the rating buttons), so stub them to
// plain views/builders so the screen renders without the native runtime.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    // Stable across renders, like the real hook — an unstable shared value would
    // churn callback identities and re-fire the session-load effect.
    useSharedValue: (init: unknown) => React.useRef({ value: init }).current,
    useAnimatedStyle: () => ({}),
    useDerivedValue: () => ({ value: 0 }),
    withTiming: (v: number) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  builder.onStart = () => builder;
  builder.onUpdate = () => builder;
  builder.onEnd = () => builder;
  builder.activeOffsetX = () => builder;
  builder.requireExternalGestureToFail = () => builder;
  const make = () => builder;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Tap: make, Pan: make, Race: make, Native: make },
  };
});

jest.mock('@/db/cards', () => ({
  // The DB calls are stubbed, but the summary derives each card's "after" level
  // from the real `nextReview` (pure logic), so keep the actual implementation.
  ...jest.requireActual('@/db/cards'),
  getDueCards: jest.fn(),
  rateCard: jest.fn().mockResolvedValue(undefined),
  editCard: jest.fn().mockResolvedValue(undefined),
}));

const mockedGetDueCards = getDueCards as jest.Mock;
const mockedRateCard = rateCard as jest.Mock;
const mockedEditCard = editCard as jest.Mock;

// Build `n` due cards with distinct, identifiable fronts (front-0, front-1, …).
const makeCards = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    deck_id: 1,
    front: `front-${i}`,
    back: `back-${i}`,
    familiarity: 0,
    due_at: 0,
    created_at: 0,
  }));

type Screen = Awaited<ReturnType<typeof render>>;

// The track only mounts its cards once the viewport has measured a non-zero
// width (onLayout). That layout pass never fires on its own in tests, so find
// the one element that carries an onLayout handler (the viewport) and drive it.
type HostNode = { props: Record<string, unknown>; children?: unknown[] };
const findOnLayout = (node: unknown): HostNode | null => {
  if (!node || typeof node !== 'object') return null;
  const host = node as HostNode;
  if (typeof host.props?.onLayout === 'function') return host;
  for (const child of host.children ?? []) {
    const found = findOnLayout(child);
    if (found) return found;
  }
  return null;
};
const layoutViewport = async (screen: Screen, width = 300): Promise<void> => {
  const viewport = findOnLayout(screen.root);
  if (!viewport) throw new Error('no viewport with onLayout found');
  await fireEvent(viewport as unknown as Parameters<typeof fireEvent>[0], 'layout', {
    nativeEvent: { layout: { width, height: 600 } },
  });
};

// The card fronts currently mounted in the track (the whole batch renders at
// once, side by side). Each card shows its front once, as `front-<n>`.
const frontsOnScreen = (screen: Screen): string[] =>
  screen.getAllByText(/^front-\d+$/).map((node) => node.props.children as string);

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never repeats a card within a session, even when rated due again', async () => {
    // 15 due cards -> a batch of 10, then a "Practice 5 more" round.
    mockedGetDueCards.mockResolvedValue(makeCards(15));

    const screen = await render(<PracticeScreen />);
    await screen.findByText('1 / 10');
    await layoutViewport(screen);

    // The first batch is 10 distinct cards.
    const batch1 = frontsOnScreen(screen);
    expect(batch1).toHaveLength(10);

    // Rate every card "Hard" (which in the real DB leaves it due again) to walk
    // the batch to its end and reach the summary.
    for (let n = 0; n < 10; n++) {
      await fireEvent.press(screen.getByText('Hard'));
    }

    // Summary offers exactly the 5 cards left in the session deck.
    await screen.findByText('Practice 5 more');

    // Second round: the next 5 cards off the top. Width was already measured, so
    // the new batch mounts straight away.
    await fireEvent.press(screen.getByText('Practice 5 more'));
    await screen.findByText('1 / 5');
    const batch2 = frontsOnScreen(screen);
    expect(batch2).toHaveLength(5);

    // No card from the first batch reappears, and across the session all 15
    // distinct cards were dealt exactly once...
    const seen = [...batch1, ...batch2];
    expect(new Set(seen).size).toBe(15);
    // ...and the due set was snapshotted once, not re-queried per batch.
    expect(mockedGetDueCards).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the session deck from the DB on re-entry', async () => {
    mockedGetDueCards.mockResolvedValue(makeCards(3));

    const first = await render(<PracticeScreen />);
    await first.findByText('1 / 3');
    // Flush teardown inside act before re-rendering, so the unmount and the next
    // mount don't overlap act scopes and leak into the following test.
    await act(async () => {
      first.unmount();
    });

    // Re-entering practice fetches a fresh snapshot rather than reusing the old one.
    const second = await render(<PracticeScreen />);
    await second.findByText('1 / 3');
    expect(mockedGetDueCards).toHaveBeenCalledTimes(2);
  });

  it('edits the current card front/back in place via the pencil', async () => {
    mockedGetDueCards.mockResolvedValue(makeCards(1));
    // Force the card to start front-up so the front face is the interactive one
    // (the hidden face has pointerEvents="none"). randomFace() shows the back when
    // Math.random() < 0.5, so a high value keeps the front showing.
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    try {
      const screen = await render(<PracticeScreen />);
      await screen.findByText('1 / 1');
      await layoutViewport(screen);

      // Open the editor from the front face's pencil (each face carries one).
      await fireEvent.press(screen.getAllByLabelText('Edit card')[0]);

      // The modal is seeded with the card's current text; change the front and save.
      await fireEvent.changeText(screen.getByDisplayValue('front-0'), 'hola');
      await fireEvent.press(screen.getByText('Save'));

      // Only front/back are written, and exactly once — id, deck, familiarity,
      // due_at and created_at are not part of the edit.
      expect(mockedEditCard).toHaveBeenCalledTimes(1);
      expect(mockedEditCard).toHaveBeenCalledWith(0, 'hola', 'back-0');
      // Editing must not rate the card — rateCard is the only path that would move
      // familiarity / due_at, so its absence proves scheduling is untouched.
      expect(mockedRateCard).not.toHaveBeenCalled();

      // The new front shows in place; the back is unchanged and the session stays
      // put (same card, same position) — nothing else moved.
      await screen.findByText('hola');
      expect(screen.getByText('back-0')).toBeTruthy();
      expect(screen.getByText('1 / 1')).toBeTruthy();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('lists each reviewed word with its before → after level change', async () => {
    // Two due cards at known levels so the derived "after" is predictable:
    // a "Good" advances one level (2 → 3); a "Hard" resets to 0 (3 → 0).
    mockedGetDueCards.mockResolvedValue([
      { id: 0, deck_id: 1, front: 'front-0', back: 'back-0', familiarity: 2, due_at: 0, created_at: 0 },
      { id: 1, deck_id: 1, front: 'front-1', back: 'back-1', familiarity: 3, due_at: 0, created_at: 0 },
    ]);

    const screen = await render(<PracticeScreen />);
    await screen.findByText('1 / 2');
    await layoutViewport(screen);

    // Rate the first card "Good" (auto-advances) and the last "Hard" (ends session).
    await fireEvent.press(screen.getByText('Good'));
    await fireEvent.press(screen.getByText('Hard'));

    // The summary lists both reviewed words under a heading.
    await screen.findByText('Reviewed');
    expect(screen.getByText('front-0')).toBeTruthy();
    expect(screen.getByText('front-1')).toBeTruthy();

    // Level badges reflect each change: 2→3 (Good) and 3→0 (Hard). "Lvl 3"
    // appears twice (front-0's after and front-1's before).
    expect(screen.getByText('Lvl 2')).toBeTruthy();
    expect(screen.getAllByText('Lvl 3')).toHaveLength(2);
    expect(screen.getByText('Lvl 0')).toBeTruthy();
  });

  it('lists a swiped-past card with just its current level badge (no transition)', async () => {
    // Two cards at level 1. The first is swiped past (never rated); the second is
    // rated "Good" (1 → 2), which ends the session and shows the summary.
    mockedGetDueCards.mockResolvedValue([
      { id: 0, deck_id: 1, front: 'front-0', back: 'back-0', familiarity: 1, due_at: 0, created_at: 0 },
      { id: 1, deck_id: 1, front: 'front-1', back: 'back-1', familiarity: 1, due_at: 0, created_at: 0 },
    ]);

    // Swiping is a web-only keyboard path in tests (the gesture handler is
    // stubbed, so ArrowRight is the only way to advance without rating). jest-expo
    // runs in a node env, so stand up a minimal window keydown API for the effect.
    const origOS = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });
    const keydownHandlers = new Set<(e: { key: string }) => void>();
    const origAdd = window.addEventListener;
    const origRemove = window.removeEventListener;
    window.addEventListener = ((type: string, fn: (e: { key: string }) => void) => {
      if (type === 'keydown') keydownHandlers.add(fn);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((_type: string, fn: (e: { key: string }) => void) => {
      keydownHandlers.delete(fn);
    }) as typeof window.removeEventListener;
    try {
      const screen = await render(<PracticeScreen />);
      await screen.findByText('1 / 2');
      await layoutViewport(screen);

      // Skip the first card without rating it (ArrowRight = next).
      await act(async () => {
        for (const fn of keydownHandlers) fn({ key: 'ArrowRight' });
      });
      await screen.findByText('2 / 2');

      // Rate the last card "Good" — this ends the session.
      await fireEvent.press(screen.getByText('Good'));
      await screen.findByText('Reviewed');

      // Both words are listed, but only the rated one hit the DB.
      expect(screen.getByText('front-0')).toBeTruthy();
      expect(screen.getByText('front-1')).toBeTruthy();
      expect(mockedRateCard).toHaveBeenCalledTimes(1);

      // front-1 moved 1 → 2 (one transition = exactly one arrow). The swiped-past
      // front-0 shows a single "Lvl 1" badge, so there is no second arrow and
      // "Lvl 1" appears twice (front-0's badge + front-1's "before").
      expect(screen.getByText('Lvl 2')).toBeTruthy();
      expect(screen.getAllByText('→')).toHaveLength(1);
      expect(screen.getAllByText('Lvl 1')).toHaveLength(2);
    } finally {
      window.addEventListener = origAdd;
      window.removeEventListener = origRemove;
      if (origOS) Object.defineProperty(Platform, 'OS', origOS);
    }
  });

  it('shows the empty state when no cards are due', async () => {
    mockedGetDueCards.mockResolvedValue([]);

    const screen = await render(<PracticeScreen />);
    await screen.findByText('There are no due cards in this deck right now.');
    expect(mockedRateCard).not.toHaveBeenCalled();
  });
});
