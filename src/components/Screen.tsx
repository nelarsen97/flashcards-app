import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

// One chalk-dust fleck per this many square px of board (then capped).
const DUST_AREA = 5000;
const DUST_MAX = 140;

interface ScreenProps {
  children: ReactNode;
  /** Container styles (horizontal padding, top padding, etc.). Don't set a
   *  bottom padding here — `bottomOffset` owns the bottom so it can't be lost. */
  style?: StyleProp<ViewStyle>;
  /** Extra padding below the safe-area inset, e.g. breathing room above the
   *  nav bar. The bottom padding is always at least the inset. */
  bottomOffset?: number;
  /** Draw the chalkboard background. Default true. */
  board?: boolean;
}

// Deterministic PRNG so the chalk dust is stable across renders.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Full-height screen container that always reserves room for the Android system
 * navigation bar / gesture area at the bottom. Pin buttons or other controls to
 * the bottom of a `<Screen>` and they can never be drawn under the nav bar again
 * — the safe-area bottom inset is applied here, once, instead of being remembered
 * per screen.
 *
 * It also paints the chalkboard backdrop: a dark board scattered with faint
 * chalk dust, behind the content. The backdrop is `pointerEvents="none"` so it
 * never intercepts taps; opaque cards/inputs layered on top read as paper and
 * supplies on the board. Lists/wrappers should stay transparent so the board
 * shows through between them, and text drawn straight on it uses `colors.chalk`.
 *
 * The inset is layered after `style` so a screen's own container styles can't
 * accidentally cancel it. The top is intentionally left to the navigation
 * header, which already clears the status bar.
 */
export function Screen({ children, style, bottomOffset = 0, board = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {board ? <Chalkboard /> : null}
      <View style={[styles.flex, style, { paddingBottom: insets.bottom + bottomOffset }]}>
        {children}
      </View>
    </View>
  );
}

/** The chalkboard backdrop: a dark board speckled with faint chalk dust. */
function Chalkboard() {
  const { width, height } = useWindowDimensions();
  const dust = useMemo(() => {
    const count = Math.min(DUST_MAX, Math.round((width * height) / DUST_AREA));
    const rng = mulberry32(0x9e3779b9);
    return Array.from({ length: count }, () => {
      const size = 1 + rng() * 2;
      return {
        top: `${rng() * 100}%` as const,
        left: `${rng() * 100}%` as const,
        size,
        opacity: 0.04 + rng() * 0.1,
      };
    });
  }, [width, height]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dust.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: '#FFFFFF',
            opacity: d.opacity,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chalkboard },
  flex: { flex: 1 },
});
