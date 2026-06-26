import { act, fireEvent, render } from '@testing-library/react-native';

import PracticeScreen from '@/app/deck/[id]/practice';
import { Card, getDueCards, rateCard } from '@/db/cards';

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
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: () => ({}),
    useDerivedValue: () => ({ value: 0 }),
    withTiming: (v: number) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  builder.onEnd = () => builder;
  builder.activeOffsetX = () => builder;
  const make = () => builder;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Tap: make, Pan: make, Race: make },
  };
});

jest.mock('@/db/cards', () => ({
  getDueCards: jest.fn(),
  rateCard: jest.fn().mockResolvedValue(undefined),
}));

const mockedGetDueCards = getDueCards as jest.Mock;
const mockedRateCard = rateCard as jest.Mock;

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

  it('shows the empty state when no cards are due', async () => {
    mockedGetDueCards.mockResolvedValue([]);

    const screen = await render(<PracticeScreen />);
    await screen.findByText('There are no due cards in this deck right now.');
    expect(mockedRateCard).not.toHaveBeenCalled();
  });
});
