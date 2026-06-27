import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing } from '@/theme';

// The chalkboard texture: a hand-authored vector board dusted with freshly-erased
// chalk. Vector, so it scales cleanly to fill any screen edge-to-edge.
const CHALKBOARD = require('../../assets/images/chalkboard.png');

// Height of the in-screen header's toolbar, below the status-bar inset.
const TOOLBAR_HEIGHT = 56;

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
  /** Header title. Omit for a screen with no header (e.g. a bare spinner). */
  title?: string;
  /** Show a back button: `true` pops the stack, or pass a custom handler. */
  onBack?: boolean | (() => void);
  /** Node pinned to the header's right edge (e.g. an overflow-menu button). */
  headerRight?: ReactNode;
}

/**
 * Full-height screen container over a chalkboard backdrop. It paints the
 * chalkboard image edge-to-edge — behind the status bar and its own header — so
 * the board covers the whole screen, and renders an in-screen header instead of
 * the navigation header so nothing flat bands across the top. Content sits in
 * normal flow below the header, so scrolling lists never bleed up through it.
 * Text drawn straight on the board uses `colors.chalk`.
 *
 * It also always reserves room for the Android system navigation bar at the
 * bottom: the safe-area bottom inset is applied here, once, so controls pinned to
 * the bottom of a `<Screen>` can never be drawn under the nav bar.
 */
export function Screen({
  children,
  style,
  bottomOffset = 0,
  board = true,
  title,
  onBack,
  headerRight,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {board ? <Image source={CHALKBOARD} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      {title !== undefined ? (
        <BoardHeader title={title} onBack={onBack} right={headerRight} />
      ) : null}
      <View style={[styles.flex, style, { paddingBottom: insets.bottom + bottomOffset }]}>
        {children}
      </View>
    </View>
  );
}

/** The in-screen header: back button, title, and an optional right slot, drawn
 *  transparently over the board so its texture shows through. */
function BoardHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: boolean | (() => void);
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack === true ? () => router.back() : typeof onBack === 'function' ? onBack : undefined;
  return (
    <View style={[styles.header, { paddingTop: insets.top, height: insets.top + TOOLBAR_HEIGHT }]}>
      {back ? (
        <Pressable
          onPress={back}
          hitSlop={spacing.sm}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
      ) : null}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.headerRightSlot}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The board color is the fallback while the image loads.
  root: { flex: 1, backgroundColor: colors.chalkboard },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  headerBtn: { paddingVertical: spacing.xs },
  backIcon: { fontSize: 26, lineHeight: 30, color: colors.chalk, fontFamily: fonts.bodyBold },
  headerTitle: { flex: 1, fontFamily: fonts.heading, fontSize: 22, color: colors.chalk },
  headerRightSlot: { marginLeft: spacing.sm },
  pressed: { opacity: 0.6 },
});
