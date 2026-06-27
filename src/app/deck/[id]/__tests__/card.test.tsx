import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CardScreen from '@/app/deck/[id]/card';
import { findDuplicateFront } from '@/db/cards';

// Add mode: no cardId param. The screen reads the deck id from the route.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  __esModule: true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/db/cards', () => ({
  addCard: jest.fn().mockResolvedValue(1),
  editCard: jest.fn().mockResolvedValue(undefined),
  deleteCard: jest.fn().mockResolvedValue(undefined),
  getCard: jest.fn().mockResolvedValue(null),
  findDuplicateFront: jest.fn().mockResolvedValue(null),
}));

const mockedFind = findDuplicateFront as jest.Mock;

describe('CardScreen duplicate warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a non-blocking warning after the debounce when the front already exists', async () => {
    mockedFind.mockResolvedValue({ deckName: 'Easy words' });
    const screen = await render(<CardScreen />);

    await fireEvent.changeText(screen.getAllByDisplayValue('')[0], 'house');

    // Debounced: the lookup hasn't fired synchronously on the keystroke.
    expect(mockedFind).not.toHaveBeenCalled();

    // The warning appears once the debounce elapses and the lookup resolves.
    expect(await screen.findByText('Already exists in “Easy words”')).toBeTruthy();
    expect(mockedFind).toHaveBeenCalledWith('house');
    // Advisory only — Save remains available.
    expect(screen.getByText('Save card')).toBeTruthy();
  });

  it('does not warn when there is no match', async () => {
    mockedFind.mockResolvedValue(null);
    const screen = await render(<CardScreen />);

    await fireEvent.changeText(screen.getAllByDisplayValue('')[0], 'barn');
    await waitFor(() => expect(mockedFind).toHaveBeenCalledWith('barn'));

    expect(screen.queryByText(/Already exists in/)).toBeNull();
  });
});
