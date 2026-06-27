import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, radius, shadow, spacing } from '@/theme';

// Deep rose ink for the label — like a worn-in pencil mark on the eraser.
const ERASER_INK = '#8A3340';

interface EraserButtonProps {
  title?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * A button drawn as a pink Pearl eraser: a soft pink slab with a lighter top
 * highlight and a darker bottom bevel for depth, labelled in deep-rose ink.
 */
export function EraserButton({
  title = 'Delete',
  onPress,
  disabled,
  loading,
  style,
  accessibilityLabel,
}: EraserButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.eraser,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {/* Top highlight + bottom bevel give the rubber a rounded, 3D feel. */}
      <View style={styles.highlight} pointerEvents="none" />
      <View style={styles.bevel} pointerEvents="none" />
      {loading ? (
        <ActivityIndicator color={ERASER_INK} />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eraser: {
    height: 52,
    borderRadius: radius.sm, // erasers have soft, only-slightly-rounded corners
    backgroundColor: colors.eraser,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '34%',
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  bevel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: colors.danger, // a darker pink: the shadowed base of the eraser
  },
  label: {
    fontSize: 17,
    fontFamily: fonts.bodyBold,
    color: ERASER_INK,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
