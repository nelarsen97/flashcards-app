import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, shadow } from '@/theme';

// Deep rose ink for the label — like a worn-in pencil mark on the eraser.
const ERASER_INK = '#8A3340';
const ERASER_H = 52;
const BEVEL_H = 8;
// The rhombus lean. A Pink Pearl eraser is a parallelogram, so the body is a
// rectangle skewed sideways. The skew pushes the slanted ends out past the flat
// rectangle by OVERHANG at the top/bottom edges; the body is inset by that much
// so those points land inside the touch target rather than poking past it.
const SKEW_DEG = 14;
const OVERHANG = Math.round((ERASER_H / 2) * Math.tan((SKEW_DEG * Math.PI) / 180));

interface EraserButtonProps {
  title?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * A button drawn as a pink Pearl eraser: a parallelogram (rhombus) slab of soft
 * pink with a lighter top highlight and a darker bottom bevel for depth, labelled
 * in deep-rose ink. The label stays upright and is centered in the main pink face
 * (the largest color block), above the bevel.
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
        styles.touch,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {/* The skewed pink rhombus, with a top highlight and a bottom bevel. */}
      <View style={styles.shape} pointerEvents="none">
        <View style={styles.highlight} />
        <View style={styles.bevel} />
      </View>
      {/* Upright label, centered in the pink face above the bevel. */}
      <View style={styles.labelWrap} pointerEvents="none">
        {loading ? (
          <ActivityIndicator color={ERASER_INK} />
        ) : (
          <Text numberOfLines={1} style={styles.label}>
            {title}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    height: ERASER_H,
    justifyContent: 'center',
  },
  shape: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: OVERHANG,
    right: OVERHANG,
    backgroundColor: colors.eraser,
    borderRadius: 4,
    overflow: 'hidden',
    transform: [{ skewX: `-${SKEW_DEG}deg` }],
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
    height: BEVEL_H,
    backgroundColor: colors.danger, // a darker pink: the shadowed base of the eraser
  },
  // Spans the touch area but stops above the bevel, so the label centers in the
  // largest color block (the pink face) rather than the whole slab.
  labelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: BEVEL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontFamily: fonts.bodyBold,
    color: ERASER_INK,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
