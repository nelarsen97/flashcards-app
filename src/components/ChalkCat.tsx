import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '@/theme';

/**
 * A little cat sketched in chalk, sitting on the chalkboard home screen. Built
 * from plain Views (no image asset) the same way `PaperBackground` draws the
 * ruled lines, and purely decorative — it never intercepts touches. Its eyes and
 * nose are knocked out in the board color so they read as negative space, the way
 * a chalk doodle leaves the slate showing through.
 */
export function ChalkCat({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.cat, style]}
      accessibilityRole="image"
      accessibilityLabel="A cat doodled in chalk"
    >
      {/* Tail sweeping up the right side — drawn first so it sits behind the body. */}
      <View style={styles.tail} />
      <View style={styles.body} />
      <View style={styles.head}>
        <View style={[styles.ear, styles.earLeft]} />
        <View style={[styles.ear, styles.earRight]} />
        <View style={[styles.eye, styles.eyeLeft]} />
        <View style={[styles.eye, styles.eyeRight]} />
        <View style={styles.nose} />
      </View>
    </View>
  );
}

// Decorative pixel geometry, so these are raw sizes rather than spacing tokens;
// the chalk/board colors still come from the theme.
const styles = StyleSheet.create({
  cat: {
    width: 100,
    height: 96,
    opacity: 0.92,
  },
  // A rounded "egg" sitting on the floor — the seated body.
  body: {
    position: 'absolute',
    bottom: 0,
    left: 15,
    width: 70,
    height: 62,
    backgroundColor: colors.chalk,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  head: {
    position: 'absolute',
    top: 2,
    left: 23,
    width: 54,
    height: 50,
    backgroundColor: colors.chalk,
    borderRadius: 26,
  },
  // Upward triangle via the border trick; rotated out to either side.
  ear: {
    position: 'absolute',
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.chalk,
  },
  earLeft: { left: 3, transform: [{ rotate: '-22deg' }] },
  earRight: { right: 3, transform: [{ rotate: '22deg' }] },
  // Eyes/nose knocked out in the board color so the slate shows through them.
  eye: {
    position: 'absolute',
    top: 20,
    width: 7,
    height: 10,
    borderRadius: 4,
    backgroundColor: colors.chalkboard,
  },
  eyeLeft: { left: 14 },
  eyeRight: { right: 14 },
  // A small downward triangle for the nose.
  nose: {
    position: 'absolute',
    top: 31,
    left: 22,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.chalkboard,
  },
  // A curved tail: an arc made from the right/bottom borders of a transparent box.
  tail: {
    position: 'absolute',
    right: -8,
    bottom: 0,
    width: 34,
    height: 44,
    borderColor: colors.chalk,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
  },
});
