/* eslint-disable react-hooks/immutability -- Reanimated shared values (incl. the
   `positions`/`activeId` passed between rows) are mutated through `.value` by
   design; the React Compiler immutability rule doesn't model that idiom. */
import { ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { objectMove, orderOf, Positions } from '@/components/deckReorder';
import { spacing } from '@/theme';

// Deck covers are a fixed height (their minHeight); the list lays rows out by
// absolute position so a dragged row can float over its neighbours while they
// slide to make room. ROW_HEIGHT must match the cover's height in the parent.
export const DECK_ROW_HEIGHT = 104;
const ROW_GAP = spacing.md;
const SLOT = DECK_ROW_HEIGHT + ROW_GAP;
// How long a long-press lifts a deck before it starts following the finger.
const LIFT_DELAY_MS = 220;
const SETTLE_MS = 200;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

interface Identifiable {
  id: number;
}

interface DraggableDeckListProps<T extends Identifiable> {
  decks: T[];
  /** Persist the new top-to-bottom order of deck ids after a drag settles. */
  onReorder: (orderedIds: number[]) => void;
  renderItem: (deck: T) => ReactNode;
}

export function DraggableDeckList<T extends Identifiable>({
  decks,
  onReorder,
  renderItem,
}: DraggableDeckListProps<T>) {
  const positions = useSharedValue<Positions>(mapPositions(decks));
  const activeId = useSharedValue<number | null>(null);

  // Resync when decks are added/removed/replaced (e.g. after create, delete, or
  // a focus reload). A drag never changes the prop mid-gesture, so this can't
  // clobber an in-progress reorder.
  useEffect(() => {
    positions.value = mapPositions(decks);
  }, [decks, positions]);

  return (
    <View style={[styles.container, { height: decks.length * SLOT }]}>
      {decks.map((deck, index) => (
        <DraggableRow
          key={deck.id}
          id={deck.id}
          index={index}
          count={decks.length}
          positions={positions}
          activeId={activeId}
          onReorder={onReorder}
        >
          {renderItem(deck)}
        </DraggableRow>
      ))}
    </View>
  );
}

interface DraggableRowProps {
  id: number;
  index: number;
  count: number;
  positions: SharedValue<Positions>;
  activeId: SharedValue<number | null>;
  onReorder: (orderedIds: number[]) => void;
  children: ReactNode;
}

function DraggableRow({
  id,
  index,
  count,
  positions,
  activeId,
  onReorder,
  children,
}: DraggableRowProps) {
  // Fall back to the array index until the positions map includes this row (a
  // freshly-created deck mounts before the resync effect runs).
  const top = useSharedValue((positions.value[id] ?? index) * SLOT);
  const isActive = useSharedValue(false);
  const startTop = useSharedValue(0);

  // While idle, follow the slot this row is reindexed into as other rows drag.
  useAnimatedReaction(
    () => positions.value[id],
    (pos, prev) => {
      if (pos == null || pos === prev) return;
      if (!isActive.value) top.value = withTiming(pos * SLOT, { duration: SETTLE_MS });
    }
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(LIFT_DELAY_MS)
    .onStart(() => {
      isActive.value = true;
      activeId.value = id;
      // Same `?? index` fallback as the initial `top`: a deck dragged before the
      // resync effect has populated the map would otherwise seed startTop to NaN.
      startTop.value = (positions.value[id] ?? index) * SLOT;
    })
    .onUpdate((event) => {
      // The active row tracks the finger; its slot index is recomputed so the
      // other rows shuffle around it.
      const y = startTop.value + event.translationY;
      top.value = y;
      const newIndex = clamp(Math.round(y / SLOT), 0, count - 1);
      const curIndex = positions.value[id];
      if (newIndex !== curIndex) {
        positions.value = objectMove(positions.value, curIndex, newIndex);
      }
    })
    .onEnd(() => {
      // Snap the lifted row down into its final slot.
      top.value = withTiming(positions.value[id] * SLOT, { duration: SETTLE_MS });
    })
    .onFinalize(() => {
      if (activeId.value !== id) return;
      isActive.value = false;
      activeId.value = null;
      runOnJS(onReorder)(orderOf(positions.value, count));
    });

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: isActive.value ? 1 : 0,
    transform: [{ scale: withTiming(isActive.value ? 1.03 : 1, { duration: 150 }) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.row, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

function mapPositions(decks: Identifiable[]): Positions {
  const map: Positions = {};
  decks.forEach((deck, index) => {
    map[deck.id] = index;
  });
  return map;
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: DECK_ROW_HEIGHT,
  },
});
