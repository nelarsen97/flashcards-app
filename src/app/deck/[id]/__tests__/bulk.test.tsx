import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import BulkAddScreen from '@/app/deck/[id]/bulk';
import { importCards } from '@/db/cards';

const mockBack = jest.fn();

// The screen reads the deck id from the route and returns after importing.
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '1' }),
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  Stack: { Screen: () => null },
  __esModule: true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

jest.mock('@/db/cards', () => ({ importCards: jest.fn().mockResolvedValue(0) }));

const mockedImport = importCards as jest.Mock;

describe('BulkAddScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('previews the card count and bulk-adds the parsed lines on the default "-" separator', async () => {
    mockedImport.mockResolvedValue(2);
    const screen = await render(<BulkAddScreen />);

    // Until there's valid input, the count nudges the user and Add is a no-op.
    await fireEvent.changeText(
      screen.getByPlaceholderText(/anstendig/),
      'anstendig - decent\nuventet - unexpected'
    );
    expect(screen.getByText('2 cards will be added.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add cards'));
    expect(mockedImport).toHaveBeenCalledWith(1, [
      { front: 'anstendig', back: 'decent' },
      { front: 'uventet', back: 'unexpected' },
    ]);
    expect(mockBack).toHaveBeenCalled();
  });

  it('parses with a user-set custom separator', async () => {
    mockedImport.mockResolvedValue(1);
    const screen = await render(<BulkAddScreen />);

    await fireEvent.changeText(screen.getByLabelText('Separator'), ';');
    await fireEvent.changeText(screen.getByPlaceholderText(/anstendig/), 'hund;dog');

    expect(screen.getByText('1 card will be added.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add cards'));
    expect(mockedImport).toHaveBeenCalledWith(1, [{ front: 'hund', back: 'dog' }]);
  });
});
