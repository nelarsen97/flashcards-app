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
