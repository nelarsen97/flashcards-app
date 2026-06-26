import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: ReactNode;
  /** Container styles (horizontal padding, top padding, etc.). Don't set a
   *  bottom padding here — `bottomOffset` owns the bottom so it can't be lost. */
  style?: StyleProp<ViewStyle>;
  /** Extra padding below the safe-area inset, e.g. breathing room above the
   *  nav bar. The bottom padding is always at least the inset. */
  bottomOffset?: number;
}

/**
 * Full-height screen container that always reserves room for the Android system
 * navigation bar / gesture area at the bottom. Pin buttons or other controls to
 * the bottom of a `<Screen>` and they can never be drawn under the nav bar again
 * — the safe-area bottom inset is applied here, once, instead of being remembered
 * per screen.
 *
 * The inset is layered after `style` so a screen's own container styles can't
 * accidentally cancel it. The top is intentionally left to the navigation
 * header, which already clears the status bar.
 */
export function Screen({ children, style, bottomOffset = 0 }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.flex, style, { paddingBottom: insets.bottom + bottomOffset }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
