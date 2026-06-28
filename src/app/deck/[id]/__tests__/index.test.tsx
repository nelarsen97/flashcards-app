import { fireEvent, render } from '@testing-library/react-native';

import DeckDetailScreen from '@/app/deck/[id]';
import { Card, listCards } from '@/db/cards';
import { getDeck } from '@/db/decks';

const mockPush = jest.fn();

// The screen reads the deck id from the route and pushes to card/practice routes.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  Stack: { Screen: () => null },
  // Run the focus callback like a normal effect so the screen loads its data.
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
  __esModule: true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

// Keep LEVEL_GROUPS real (the level filter menu reads it) but stub the DB calls.
jest.mock('@/db/cards', () => ({
  listCards: jest.fn(),
  deleteCards: jest.fn().mockResolvedValue(undefined),
  moveCards: jest.fn().mockResolvedValue(undefined),
  importCards: jest.fn().mockResolvedValue(0),
  LEVEL_GROUPS: [
    { key: 'new', label: 'New', min: 0, max: 0 },
    { key: 'learning', label: 'Learning', min: 1, max: 2 },
    { key: 'familiar', label: 'Familiar', min: 3, max: 4 },
    { key: 'mature', label: 'Mature', min: 5, max: 9 },
  ],
}));

jest.mock('@/db/decks', () => ({
  getDeck: jest.fn(),
  deleteDeck: jest.fn().mockResolvedValue(undefined),
  renameDeck: jest.fn().mockResolvedValue(undefined),
  listDecksWithCounts: jest.fn().mockResolvedValue([]),
}));

const mockedListCards = listCards as jest.Mock;
const mockedGetDeck = getDeck as jest.Mock;

const makeCards = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    deck_id: 1,
    front: `front-${i + 1}`,
    back: `back-${i + 1}`,
    familiarity: 0,
    due_at: 0,
    created_at: 0,
  }));

describe('DeckDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDeck.mockResolvedValue({ id: 1, name: 'Spanish', created_at: 0 });
    mockedListCards.mockResolvedValue(makeCards(2));
  });

  it('shows Practice and Add card together, with no Select-cards button', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('front-1');

    expect(screen.getByText('Add card')).toBeTruthy();
    // due_at is 0 (in the past) so all cards are due and Practice is enabled.
    expect(screen.getByText('Practice')).toBeTruthy();
    // The dedicated entry point into selection mode is gone.
    expect(screen.queryByText('Select cards')).toBeNull();
  });

  it('navigates to the bulk-add screen from the overflow menu', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('front-1');

    await fireEvent.press(screen.getByLabelText('Deck options'));
    await fireEvent.press(screen.getByText('Add cards in bulk'));

    expect(mockPush).toHaveBeenCalledWith('/deck/1/bulk');
  });

  it('enters selection mode on long-press, pre-selecting the pressed card', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('front-1');

    // Long-press the first card: it should flip into selection mode with that
    // card already checked, rather than navigating to the card editor.
    await fireEvent(screen.getByText('front-1'), 'longPress');

    expect(screen.getByText('1 card selected')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    // Long-press selects rather than opens the card editor.
    expect(mockPush).not.toHaveBeenCalled();

    // Tapping the second card adds it to the selection (singular -> plural).
    await fireEvent.press(screen.getByText('front-2'));
    expect(screen.getByText('2 cards selected')).toBeTruthy();
  });
});

describe('DeckDetailScreen filtering', () => {
  // due_at far in the future → "learned" (due_at > now); due_at 0 → "due".
  const FUTURE = 2_000_000_000_000; // year 2033

  // front doubles as the test label; familiarity + due_at span every level group
  // and both sides of the due/learned split.
  const fruit: Card[] = [
    { id: 1, deck_id: 1, front: 'apple', back: 'apple-back', familiarity: 0, due_at: 0, created_at: 0 }, // New, Due
    { id: 2, deck_id: 1, front: 'banana', back: 'banana-back', familiarity: 2, due_at: 0, created_at: 0 }, // Learning, Due
    { id: 3, deck_id: 1, front: 'cherry', back: 'cherry-back', familiarity: 4, due_at: FUTURE, created_at: 0 }, // Familiar, Learned
    { id: 4, deck_id: 1, front: 'date', back: 'date-back', familiarity: 6, due_at: FUTURE, created_at: 0 }, // Mature, Learned
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDeck.mockResolvedValue({ id: 1, name: 'Fruit', created_at: 0 });
    mockedListCards.mockResolvedValue(fruit);
  });

  it('shows every card before any filter is applied', async () => {
    const screen = await render(<DeckDetailScreen />);
    expect(await screen.findByText('apple')).toBeTruthy();
    expect(screen.getByText('banana')).toBeTruthy();
    expect(screen.getByText('cherry')).toBeTruthy();
    expect(screen.getByText('date')).toBeTruthy();
  });

  it('narrows to due cards via the Due stat tile, and clears via Total', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('apple');

    await fireEvent.press(screen.getByLabelText('Filter by Due'));
    expect(screen.getByText('apple')).toBeTruthy();
    expect(screen.getByText('banana')).toBeTruthy();
    expect(screen.queryByText('cherry')).toBeNull();
    expect(screen.queryByText('date')).toBeNull();

    // Total acts as the "show all" reset.
    await fireEvent.press(screen.getByLabelText('Filter by Total'));
    expect(screen.getByText('cherry')).toBeTruthy();
    expect(screen.getByText('date')).toBeTruthy();
  });

  it('narrows to learned cards via the Learned stat tile', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('apple');

    await fireEvent.press(screen.getByLabelText('Filter by Learned'));
    expect(screen.queryByText('apple')).toBeNull();
    expect(screen.queryByText('banana')).toBeNull();
    expect(screen.getByText('cherry')).toBeTruthy();
    expect(screen.getByText('date')).toBeTruthy();
  });

  it('practises learned cards behind a confirmation prompt', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('apple');

    // With no learned filter, Practice goes straight to the due session.
    expect(screen.getByText('Practice')).toBeTruthy();
    expect(screen.queryByText('Practice learned')).toBeNull();

    // Activating the Learned filter swaps in the study-ahead button (2 learned).
    await fireEvent.press(screen.getByLabelText('Filter by Learned'));
    const learnedButton = screen.getByText('Practice learned');

    // Tapping it opens the confirmation rather than navigating immediately.
    await fireEvent.press(learnedButton);
    expect(screen.getByText('Study learned cards?')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    // Confirming routes into practice in learned mode.
    await fireEvent.press(screen.getByText('Practice'));
    expect(mockPush).toHaveBeenCalledWith('/deck/1/practice?mode=learned');
  });

  it('filters by a familiarity group chosen from the level menu', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('apple');

    await fireEvent.press(screen.getByLabelText('Filter by level'));
    await fireEvent.press(screen.getByText('Mature'));

    expect(screen.getByText('date')).toBeTruthy();
    expect(screen.queryByText('apple')).toBeNull();
    expect(screen.queryByText('banana')).toBeNull();
    expect(screen.queryByText('cherry')).toBeNull();
  });

  it('shows the empty-filter state for an empty combination, then restores on Clear filters', async () => {
    const screen = await render(<DeckDetailScreen />);
    await screen.findByText('apple');

    // Due ∩ Mature is empty here — the only mature card (date) is learned.
    await fireEvent.press(screen.getByLabelText('Filter by Due'));
    await fireEvent.press(screen.getByLabelText('Filter by level'));
    await fireEvent.press(screen.getByText('Mature'));

    expect(screen.getByText('No cards match your filters.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.getByText('apple')).toBeTruthy();
    expect(screen.getByText('date')).toBeTruthy();
  });
});
