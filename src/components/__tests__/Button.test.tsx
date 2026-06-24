import { fireEvent, render } from '@testing-library/react-native';

import { Button } from '@/components/Button';

// Note: RNTL v14's `render` and `fireEvent` are async — always await them.
describe('Button', () => {
  it('renders its title', async () => {
    const { getByText } = await render(<Button title="Add" onPress={() => {}} />);
    expect(getByText('Add')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<Button title="Add" onPress={onPress} />);
    await fireEvent.press(getByText('Add'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<Button title="Add" onPress={onPress} disabled />);
    await fireEvent.press(getByText('Add'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('replaces the label with a spinner while loading', async () => {
    const { queryByText } = await render(<Button title="Add" onPress={() => {}} loading />);
    // While loading, the title text is swapped out for an ActivityIndicator.
    expect(queryByText('Add')).toBeNull();
  });
});
