import { ReactNode } from 'react';
import { StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

// Spacing between faint wood-grain streaks on the desk.
const GRAIN_GAP = 90;

interface ScreenProps {
  children: ReactNode;
  /** Container styles (horizontal padding, top padding, etc.). Don't set a
   *  bottom padding here — `bottomOffset` owns the bottom so it can't be lost. */
  style?: StyleProp<ViewStyle>;
  /** Extra padding below the safe-area inset, e.g. breathing room above the
   *  nav bar. The bottom padding is always at least the inset. */
  bottomOffset?: number;
  /** Draw the wood desk background. Default true. */
  desk?: boolean;
}

/**
 * Full-height screen container that always reserves room for the Android system
 * navigation bar / gesture area at the bottom. Pin buttons or other controls to
 * the bottom of a `<Screen>` and they can never be drawn under the nav bar again
 * — the safe-area bottom inset is applied here, once, instead of being remembered
 * per screen.
 *
 * It also paints the wood-desk backdrop: a warm maple surface with faint grain
 * streaks, behind the content. The backdrop is `pointerEvents="none"` so it
 * never intercepts taps; opaque cards/inputs layered on top read as paper and
 * supplies sitting on the desk. Lists/wrappers should stay transparent so the
 * desk shows through between them.
 *
 * The inset is layered after `style` so a screen's own container styles can't
 * accidentally cancel it. The top is intentionally left to the navigation
 * header, which already clears the status bar.
 */
export function Screen({ children, style, bottomOffset = 0, desk = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {desk ? <DeskSurface /> : null}
      <View style={[styles.flex, style, { paddingBottom: insets.bottom + bottomOffset }]}>
        {children}
      </View>
    </View>
  );
}

/** The wood-desk backdrop: a maple base with sparse vertical grain streaks. */
function DeskSurface() {
  const { width } = useWindowDimensions();
  const streaks = Math.ceil(width / GRAIN_GAP);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: streaks }, (_, i) => (
        <View key={i} style={[styles.grain, { left: i * GRAIN_GAP + GRAIN_GAP / 2 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.desk },
  flex: { flex: 1 },
  grain: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.deskGrain,
  },
});
