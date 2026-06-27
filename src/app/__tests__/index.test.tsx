import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as DocumentPicker from 'expo-document-picker';

import DecksScreen from '@/app/index';
import { createDeck, listDecksWithCounts } from '@/db/decks';
import { exportAllToFile, restoreFromText, shareBackup } from '@/lib/backup';

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

// The deck list is drag-reorderable; stub the reanimated/gesture-handler runtime
// (the drag itself isn't exercised here — rows still render their content).
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (init: unknown) => React.useRef({ value: init }).current,
    useAnimatedStyle: () => ({}),
    useAnimatedReaction: () => {},
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const builder: Record<string, () => unknown> = {};
  builder.onStart = () => builder;
  builder.onUpdate = () => builder;
  builder.onEnd = () => builder;
  builder.onFinalize = () => builder;
  builder.activateAfterLongPress = () => builder;
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Pan: () => builder },
  };
});

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('@/db/decks', () => ({
  listDecksWithCounts: jest.fn(),
  createDeck: jest.fn(),
  reorderDecks: jest.fn(),
}));

jest.mock('@/lib/backup', () => ({
  exportAllToFile: jest.fn(),
  restoreFromText: jest.fn(),
  shareBackup: jest.fn(),
}));

const mockedList = listDecksWithCounts as jest.Mock;
const mockedCreate = createDeck as jest.Mock;
const mockedExport = exportAllToFile as jest.Mock;
const mockedShare = shareBackup as jest.Mock;
const mockedRestore = restoreFromText as jest.Mock;
const mockedGetDocument = DocumentPicker.getDocumentAsync as jest.Mock;

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

  it('jumps straight to practice from a deck row that has due cards', async () => {
    mockedList.mockResolvedValue([
      { id: 1, name: 'Spanish', created_at: 0, total: 10, due: 3 },
      { id: 2, name: 'French', created_at: 0, total: 1, due: 0 },
    ]);

    const { findByLabelText, queryByLabelText, getByText } = await render(<DecksScreen />);

    await fireEvent.press(await findByLabelText('Practice Spanish'));
    expect(mockPush).toHaveBeenCalledWith('/deck/1/practice');

    // No Practice button on a deck with nothing due; the row still opens the deck.
    expect(queryByLabelText('Practice French')).toBeNull();
    await fireEvent.press(getByText('French'));
    expect(mockPush).toHaveBeenCalledWith('/deck/2');
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

  it('backs up from the header overflow menu', async () => {
    mockedExport.mockResolvedValue({ uri: 'file:///backup.json', deckCount: 2 });
    mockedShare.mockResolvedValue(true);
    const { getByLabelText, getByText, queryByText } = await render(<DecksScreen />);

    // Back up/Restore live behind the ⋯ menu, not on the screen itself.
    expect(queryByText('Back up')).toBeNull();
    await fireEvent.press(getByLabelText('Data options'));
    await fireEvent.press(getByText('Back up'));

    await waitFor(() => expect(mockedExport).toHaveBeenCalled());
    expect(mockedShare).toHaveBeenCalledWith('file:///backup.json');
  });

  it('restores from the header overflow menu after confirming the replace', async () => {
    mockedGetDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///pick.json' }],
    });
    mockedRestore.mockResolvedValue({ deckCount: 1, cardCount: 5 });
    // Restore now confirms the destructive whole-library replace first; auto-tap
    // "Replace" (the destructive button) so the restore proceeds.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    const { getByLabelText, getByText } = await render(<DecksScreen />);

    await fireEvent.press(getByLabelText('Data options'));
    await fireEvent.press(getByText('Restore'));

    await waitFor(() => expect(mockedRestore).toHaveBeenCalled());
    // The deck list reloads after a successful restore.
    expect(mockedList).toHaveBeenCalledTimes(2);
    alertSpy.mockRestore();
  });

  it('does not restore if the replace is declined', async () => {
    mockedGetDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///pick.json' }],
    });
    mockedRestore.mockResolvedValue({ deckCount: 1, cardCount: 5 });
    // Tap "Cancel" on the confirmation: the library must be left untouched.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });

    const { getByLabelText, getByText } = await render(<DecksScreen />);

    await fireEvent.press(getByLabelText('Data options'));
    await fireEvent.press(getByText('Restore'));

    await waitFor(() => expect(mockedGetDocument).toHaveBeenCalled());
    expect(mockedRestore).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
