import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing } from '@/theme';

// The chalkboard texture: a photographic slate board dusted with freshly-erased
// chalk, painted edge-to-edge behind every screen (contentFit="cover").
const CHALKBOARD = require('../../assets/images/chalkboard.png');

// Vertical spacing between the paper's ruled lines.
const PAPER_LINE_GAP = 30;

// Height of the in-screen header's toolbar, below the status-bar inset.
const TOOLBAR_HEIGHT = 56;

/** Which backdrop a screen sits on: the chalkboard (home) or a cream paper page
 *  (inside a deck). It picks the background and the on-surface text color. */
export type Surface = 'board' | 'paper';

interface ScreenProps {
  children: ReactNode;
  /** Container styles (horizontal padding, top padding, etc.). Don't set a
   *  bottom padding here — `bottomOffset` owns the bottom so it can't be lost. */
  style?: StyleProp<ViewStyle>;
  /** Extra padding below the safe-area inset, e.g. breathing room above the
   *  nav bar. The bottom padding is always at least the inset. */
  bottomOffset?: number;
  /** Which backdrop to paint: the chalkboard (default) or a cream paper page. */
  surface?: Surface;
  /** Header title. Omit for a screen with no header (e.g. a bare spinner). */
  title?: string;
  /** Show a back button: `true` pops the stack, or pass a custom handler. */
  onBack?: boolean | (() => void);
  /** Node pinned to the header's right edge (e.g. an overflow-menu button). */
  headerRight?: ReactNode;
}

/**
 * Full-height screen container over a chalkboard or cream-paper backdrop. It
 * paints the backdrop edge-to-edge — behind the status bar and its own header —
 * so it covers the whole screen, and renders an in-screen header instead of the
 * navigation header so nothing flat bands across the top. Content sits in normal
 * flow below the header, so scrolling lists never bleed up through it. Text drawn
 * straight on the backdrop uses `colors.chalk` on the board, `colors.text` (ink)
 * on the paper page.
 *
 * It also always reserves room for the Android system navigation bar at the
 * bottom: the safe-area bottom inset is applied here, once, so controls pinned to
 * the bottom of a `<Screen>` can never be drawn under the nav bar.
 */
export function Screen({
  children,
  style,
  bottomOffset = 0,
  surface = 'board',
  title,
  onBack,
  headerRight,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paper = surface === 'paper';
  return (
    <View style={[styles.root, paper && styles.rootPaper]}>
      {paper ? (
        <PaperBackground />
      ) : (
        <Image source={CHALKBOARD} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      {title !== undefined ? (
        <BoardHeader title={title} onBack={onBack} right={headerRight} paper={paper} />
      ) : null}
      <View style={[styles.flex, style, { paddingBottom: insets.bottom + bottomOffset }]}>
        {children}
      </View>
    </View>
  );
}

/** The cream notebook page: faint blue rule lines every PAPER_LINE_GAP px plus a
 *  red/pink margin rule, painted edge-to-edge behind the content. Drawn with
 *  Views (no image asset) and never intercepts touches. */
function PaperBackground() {
  const { height } = useWindowDimensions();
  const count = Math.ceil(height / PAPER_LINE_GAP);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.paperLine, { top: (i + 1) * PAPER_LINE_GAP }]} />
      ))}
      <View style={styles.paperMargin} />
    </View>
  );
}

/** The in-screen header: back button, title, and an optional right slot, drawn
 *  transparently over the backdrop so its texture shows through. On paper the
 *  title and back arrow are inked dark so they stay legible on the light page. */
function BoardHeader({
  title,
  onBack,
  right,
  paper,
}: {
  title: string;
  onBack?: boolean | (() => void);
  right?: ReactNode;
  paper: boolean;
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
          <Text style={[styles.backIcon, paper && styles.inkText]}>←</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.headerTitle, paper && styles.inkText]} numberOfLines={1}>
        {title}
      </Text>
      {right ? <View style={styles.headerRightSlot}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The board color is the fallback while the image loads.
  root: { flex: 1, backgroundColor: colors.chalkboard },
  // On paper the cream page is itself the fallback (no image to wait on).
  rootPaper: { backgroundColor: colors.paper },
  paperLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.paperLine,
  },
  paperMargin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: spacing.xl,
    width: 1.5,
    backgroundColor: colors.marginLine,
  },
  inkText: { color: colors.text },
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
