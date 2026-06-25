import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  /** Override the background color (used for the Hard/Fine/Easy buttons). */
  color?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  color,
}: ButtonProps) {
  const isSecondary = variant === 'secondary';
  const bg = color ?? (variant === 'danger' ? colors.danger : isSecondary ? colors.card : colors.primary);
  const fg = isSecondary ? colors.text : colors.primaryText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg },
        isSecondary && styles.secondaryBorder,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // Fixed height instead of minHeight + paddingVertical: on Android's New
    // Architecture (Fabric), combining a min-size constraint with padding and an
    // outer margin makes the touchable hit-rect collapse toward the centered
    // label, so only taps "near the text" register. A plain height + centered
    // content keeps the whole button pressable. See facebook/react-native#53797.
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
