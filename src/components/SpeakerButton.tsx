import * as Speech from 'expo-speech';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = {
  text: string;
  language: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A tap-to-pronounce speaker button. Speaks `text` in `language` (a BCP 47 tag,
 * e.g. 'nb-NO' for Norwegian). Interrupts any in-progress utterance first so
 * repeated taps restart cleanly. Errors (such as a missing voice for the
 * requested language) are swallowed so they never break the surrounding screen.
 */
export function SpeakerButton({ text, language, style }: Props) {
  async function speak() {
    try {
      await Speech.stop();
      const voices = await Speech.getAvailableVoicesAsync()
      console.log(voices);
      Speech.speak(text, { language });
    } catch {
      // No-op: e.g. the requested voice isn't installed on this device.
    }
  }

  return (
    <Pressable
      onPress={speak}
      hitSlop={spacing.sm}
      accessibilityRole="button"
      accessibilityLabel="Pronounce"
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      <Text style={styles.icon}>🔊</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.bg,
  },
  icon: {
    fontSize: 20,
  },
});
