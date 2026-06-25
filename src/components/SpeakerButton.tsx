import * as Speech from 'expo-speech';
import { Alert, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = {
  text: string;
  language: string;
  style?: StyleProp<ViewStyle>;
};

// Norwegian Bokmål/Nynorsk and the generic 'no' are reported inconsistently by
// TTS engines, so treat them as one family when matching a voice.
const NORWEGIAN = new Set(['nb', 'nn', 'no']);

// Compare two BCP 47 tags by their primary subtag, e.g. 'nb-NO' vs 'nb_no'.
function sameLanguage(a: string, b: string) {
  const pa = a.toLowerCase().split(/[-_]/)[0];
  const pb = b.toLowerCase().split(/[-_]/)[0];
  return pa === pb || (NORWEGIAN.has(pa) && NORWEGIAN.has(pb));
}

/**
 * A tap-to-pronounce speaker button. Speaks `text` in `language` (a BCP 47 tag,
 * e.g. 'nb-NO' for Norwegian). Interrupts any in-progress utterance first so
 * repeated taps restart cleanly. If no voice for the language is installed it
 * tells the user rather than failing silently. Other errors are swallowed so a
 * TTS hiccup never breaks practice.
 */
export function SpeakerButton({ text, language, style }: Props) {
  async function speak() {
    try {
      await Speech.stop();

      const voices = await Speech.getAvailableVoicesAsync();
      const match = voices.find((v) => v.language && sameLanguage(v.language, language));

      // Only block when we positively know the voice is missing. Some platforms
      // return an empty list even when speech works, so empty means "unknown".
      if (voices.length > 0 && !match) {
        Alert.alert(
          'Voice unavailable',
          `No ${language} text-to-speech voice is installed on this device. On Android, ` +
            `add one under Settings → System → Languages & input → Text-to-speech output.`,
        );
        return;
      }

      Speech.speak(text, { language, voice: match?.identifier });
    } catch {
      // No-op: TTS isn't critical to practicing.
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
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.bg,
  },
  icon: {
    fontSize: 30,
  },
});
