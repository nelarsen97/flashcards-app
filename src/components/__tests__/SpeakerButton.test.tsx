import * as Speech from 'expo-speech';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { SpeakerButton } from '@/components/SpeakerButton';

describe('SpeakerButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stops any in-progress speech, then speaks the text in the given language', async () => {
    const { getByLabelText } = await render(<SpeakerButton text="hund" language="nb-NO" />);
    await fireEvent.press(getByLabelText('Pronounce'));

    await waitFor(() => expect(Speech.speak).toHaveBeenCalledWith('hund', { language: 'nb-NO' }));
    expect(Speech.stop).toHaveBeenCalled();
  });

  it('uses the matching installed voice when one is available', async () => {
    (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'no-voice-1', language: 'nb-NO', name: 'Nora', quality: 'Default' },
    ]);
    const { getByLabelText } = await render(<SpeakerButton text="hund" language="nb-NO" />);
    await fireEvent.press(getByLabelText('Pronounce'));

    await waitFor(() =>
      expect(Speech.speak).toHaveBeenCalledWith('hund', {
        language: 'nb-NO',
        voice: 'no-voice-1',
      }),
    );
  });

  it('alerts instead of speaking when no voice for the language is installed', async () => {
    (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'en-voice', language: 'en-US', name: 'Sam', quality: 'Default' },
    ]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText } = await render(<SpeakerButton text="hund" language="nb-NO" />);

    await fireEvent.press(getByLabelText('Pronounce'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('swallows speech errors so the surrounding screen never breaks', async () => {
    (Speech.stop as jest.Mock).mockRejectedValueOnce(new Error('no voice'));
    const { getByLabelText } = await render(<SpeakerButton text="hund" language="nb-NO" />);

    await fireEvent.press(getByLabelText('Pronounce'));
    await waitFor(() => expect(Speech.stop).toHaveBeenCalled());
    expect(Speech.speak).not.toHaveBeenCalled();
  });
});
