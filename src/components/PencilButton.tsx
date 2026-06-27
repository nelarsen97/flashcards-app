import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, shadow, spacing } from '@/theme';

// Sharpened-tip tones — wood shaft and graphite lead. Specific to the pencil
// illustration, so they live here rather than in the shared palette.
const WOOD = '#E3B981';
const GRAPHITE = '#3A3632';
// The shaded lower facet of the yellow body — a darker amber, not grey, so it
// reads as the pencil's own paint in shadow.
const PENCIL_SHADOW = 'rgba(176,120,16,0.45)';

interface PencilButtonProps {
  title?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Smaller pencil for tight spots (e.g. the deck-row Practice button). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * A button drawn as a horizontal Ticonderoga #2 pencil: a sharpened wood/graphite
 * tip on the left, a yellow faceted body carrying the label, a green ferrule, and
 * a pink eraser cap on the right. Decoration sizes scale off the pencil height so
 * the same component works at full and compact sizes.
 */
export function PencilButton({
  title = 'Practice',
  onPress,
  disabled,
  compact,
  style,
  accessibilityLabel,
}: PencilButtonProps) {
  const h = compact ? 34 : 52;
  const tipW = Math.round(h * 0.62);
  const leadW = Math.round(h * 0.3);
  const leadH = Math.round(h * 0.22); // half-height of the graphite triangle
  const ferruleW = Math.max(6, Math.round(h * 0.16));
  const eraserW = Math.max(10, Math.round(h * 0.3));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.row,
        { height: h },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {/* Sharpened tip (points left): a wood cone with the graphite lead at its point. */}
      <View style={{ width: tipW, height: h }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderTopWidth: h / 2,
            borderBottomWidth: h / 2,
            borderRightWidth: tipW,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderRightColor: WOOD,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: h / 2 - leadH,
            width: 0,
            height: 0,
            borderTopWidth: leadH,
            borderBottomWidth: leadH,
            borderRightWidth: leadW,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderRightColor: GRAPHITE,
          }}
        />
      </View>

      {/* Yellow body with faint facet shading and the label. */}
      <View style={styles.body}>
        <View style={styles.facetTop} />
        <View style={styles.facetBottom} />
        <Text
          numberOfLines={1}
          style={[styles.label, { fontSize: compact ? 13 : 16 }]}
        >
          {title}
        </Text>
      </View>

      {/* Green ferrule with two crimp lines. */}
      <View style={{ width: ferruleW, height: h, backgroundColor: colors.ferrule, justifyContent: 'center', gap: 2 }}>
        <View style={styles.crimp} />
        <View style={styles.crimp} />
      </View>

      {/* Pink eraser cap, rounded at the far end. */}
      <View
        style={{
          width: eraserW,
          height: h,
          backgroundColor: colors.eraser,
          borderTopRightRadius: h / 2,
          borderBottomRightRadius: h / 2,
        }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    ...shadow.card,
  },
  body: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  // Faint facet shading so the body reads as a rounded pencil, not a flat bar.
  facetTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '28%',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  facetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '28%',
    backgroundColor: PENCIL_SHADOW,
  },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.primaryText,
  },
  crimp: {
    height: 1.5,
    marginHorizontal: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
