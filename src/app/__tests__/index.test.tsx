import { fireEvent, render, waitFor } from '@testing-library/react-native';

import DecksScreen from '@/app/index';
import { createDeck, listDecksWithCounts } from '@/db/decks';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  // Run the focus callback like a normal effect so the screen loads its data.
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
  // `<Link asChild>` just renders its child Pressable in tests.
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('@/db/decks', () => ({
  listDecksWithCounts: jest.fn(),
  createDeck: jest.fn(),
}));

jest.mock('@/lib/backup', () => ({
  exportAllToFile: jest.fn(),
  importFromText: jest.fn(),
  shareBackup: jest.fn(),
}));

const mockedList = listDecksWithCounts as jest.Mock;
const mockedCreate = createDeck as jest.Mock;

describe('DecksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([]);
  });

  it('renders each deck with its card count and due badge', async () => {
    mockedList.mockResolvedValue([
      { id: 1, name: 'Spanish', created_at: 0, total: 10, due: 3 },
      { id: 2, name: 'French', created_at: 0, total: 1, due: 0 },
    ]);

    const { findByText, getByText } = await render(<DecksScreen />);

    expect(await findByText('Spanish')).toBeTruthy();
    expect(getByText('French')).toBeTruthy();
    expect(getByText('10 cards')).toBeTruthy();
    expect(getByText('1 card')).toBeTruthy(); // singular
    expect(getByText('3')).toBeTruthy(); // due badge
  });

  it('shows the empty state when there are no decks', async () => {
    mockedList.mockResolvedValue([]);
    const { findByText } = await render(<DecksScreen />);
    expect(await findByText('No decks yet. Create one above to get started.')).toBeTruthy();
  });

  it('creates a deck and navigates to it on Add', async () => {
    mockedCreate.mockResolvedValue(99);
    const { getByText, getByPlaceholderText } = await render(<DecksScreen />);

    await fireEvent.changeText(getByPlaceholderText('New deck name'), 'German');
    await fireEvent.press(getByText('Add'));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('German'));
    expect(mockPush).toHaveBeenCalledWith('/deck/99');
  });
});
