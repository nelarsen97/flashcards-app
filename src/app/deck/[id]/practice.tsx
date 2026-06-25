import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { SpeakerButton } from '@/components/SpeakerButton';
import { Card, getDueCards, rateCard, Rating } from '@/db/cards';
import { colors, radius, spacing } from '@/theme';

const BATCH_SIZE = 10;
// Horizontal travel (px) past which a pan is treated as a navigation swipe.
const SWIPE_THRESHOLD = 60;

type Phase = 'loading' | 'practice' | 'summary';
type Tally = { hard: number; close: number; fine: number; easy: number };

// Randomly start a card on its front or back, so practice isn't always
// front-first. true = show the back first.
const randomFace = () => Math.random() < 0.5;

export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('loading');
  // The session deck: due cards snapshotted once at session start, randomized,
  // with the cards already dealt into batches removed. Each batch slices off the
  // top, so a card shown this session never reappears — even if a rating leaves
  // it due again. Exiting and re-entering rebuilds this from the DB.
  const queue = useRef<Card[]>([]);
  const [batch, setBatch] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  // The latest rating per batch index. Swiping back and re-rating overwrites the
  // entry, so the summary counts each card once under its final rating, and cards
  // only swiped past (never rated) never appear here.
  const [ratings, setRatings] = useState<Record<number, Rating>>({});
  // How many due cards are left after this batch — sizes the next round and its
  // button label (capped at BATCH_SIZE).
  const [remainingDue, setRemainingDue] = useState(0);
  // Number of half-turn flips so far. It only ever increases, so each tap spins
  // the card forward in the same direction instead of unwinding back the way it
  // came. Even = front showing, odd = back showing.
  const [flip, setFlip] = useState(0);
  const showBack = flip % 2 === 1;
  // Whether the next face change should animate. Tapping flips with animation;
  // advancing to the next card resets to the front with no animation, so the
  // flip-back never plays over the next card's text and spoil its answer.
  const [animate, setAnimate] = useState(true);

  // Half-turns rotated. Animates toward `flip` on tap, snaps instantly on card
  // advance. Each whole step is a 180° forward turn.
  const progress = useDerivedValue(() => {
    return animate ? withTiming(flip, { duration: 250 }) : flip;
  });

  // Tap to flip the current card, with animation. Always advances forward so the
  // card keeps spinning the same way rather than reversing.
  const toggleFace = useCallback(() => {
    setAnimate(true);
    setFlip((f) => f + 1);
  }, []);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${progress.value * 180}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${progress.value * 180 + 180}deg` },
    ],
  }));

  // Deal the next cards off the top of the session deck. No DB query — the deck
  // was snapshotted at session start, so a card already dealt never comes back.
  const loadBatch = useCallback(() => {
    const next = queue.current.slice(0, BATCH_SIZE);
    queue.current = queue.current.slice(BATCH_SIZE);
    setBatch(next);
    setRemainingDue(queue.current.length);
    setIndex(0);
    setAnimate(false);
    setFlip(randomFace() ? 1 : 0);
    setRatings({});
    setPhase(next.length === 0 ? 'summary' : 'practice');
  }, []);

  useEffect(() => {
    // Snapshot the due cards once for this session, then deal the first batch.
    // The compiler lint can't tell this one-time data load apart from a
    // render-loop setState, but it is deliberate, not derived state.
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('loading');
    getDueCards(deckId).then((cards) => {
      if (cancelled) return;
      queue.current = cards;
      loadBatch();
    });
    return () => {
      cancelled = true;
    };
  }, [deckId, loadBatch]);

  // Move to another card without rating it. Swiping is pure navigation: it never
  // touches familiarity, never writes to the DB, and never ends the session.
  // Out-of-range targets (before the first / after the last card) are no-ops.
  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= batch.length) return;
      // Snap to the new card's starting face with no flip animation, so the old
      // face never rotates into view over the new card's text.
      setAnimate(false);
      setFlip(randomFace() ? 1 : 0);
      setIndex(target);
    },
    [batch.length]
  );
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Web fallback for swiping: arrow keys navigate while practicing.
  useEffect(() => {
    if (Platform.OS !== 'web' || phase !== 'practice') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, goNext, goPrev]);

  async function handleRate(level: Rating) {
    const card = batch[index];
    if (!card) return;
    // Rate from the card's original level (its loaded value, never mutated), so a
    // re-rate after swiping back replaces the earlier rating instead of stacking.
    await rateCard(card.id, level, card.familiarity);
    setRatings((r) => ({ ...r, [index]: level }));

    if (index + 1 < batch.length) {
      // Snap straight to the next card's starting face — no flip animation, so
      // the other face never rotates into view over the new card's text.
      setAnimate(false);
      setFlip(randomFace() ? 1 : 0);
      setIndex(index + 1);
    } else {
      // Batch finished. `remainingDue` was set when this batch was dealt and the
      // session deck doesn't grow mid-batch, so it already reflects what's left.
      setPhase('summary');
    }
  }

  if (phase === 'loading') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Practice' }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (phase === 'summary') {
    // Count each rated card once under its final rating (a re-rated card has a
    // single entry in `ratings`). Cards only swiped past aren't in `ratings`.
    const tally: Tally = { hard: 0, close: 0, fine: 0, easy: 0 };
    for (const level of Object.values(ratings)) tally[level] += 1;
    const reviewed = Object.keys(ratings).length;
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + spacing.md }]}>
        <Stack.Screen options={{ title: 'Session summary' }} />
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {reviewed === 0 ? 'Nothing to practice' : 'Session complete'}
          </Text>
          {reviewed === 0 ? (
            <Text style={styles.summarySub}>There are no due cards in this deck right now.</Text>
          ) : (
            <View style={styles.summaryRow}>
              <SummaryStat label="Hard" value={tally.hard} color={colors.hard} />
              <SummaryStat label="Close" value={tally.close} color={colors.close} />
              <SummaryStat label="Fine" value={tally.fine} color={colors.fine} />
              <SummaryStat label="Easy" value={tally.easy} color={colors.easy} />
            </View>
          )}
        </View>

        <View style={styles.summaryActions}>
          {remainingDue > 0 ? (
            <Button
              title={`Practice ${Math.min(remainingDue, BATCH_SIZE)} more`}
              onPress={loadBatch}
            />
          ) : null}
          <Button title="Done" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // phase === 'practice'
  const card = batch[index];
  // Tap flips the card; a horizontal swipe navigates (left → next, right → prev).
  // activeOffsetX keeps small taps as flips rather than stealing them as pans.
  const tap = Gesture.Tap().onEnd(() => runOnJS(toggleFace)());
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) runOnJS(goNext)();
      else if (e.translationX > SWIPE_THRESHOLD) runOnJS(goPrev)();
    });
  const cardGesture = Gesture.Race(pan, tap);
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.md }]}>
      <Stack.Screen options={{ title: 'Practice' }} />
      <Text style={styles.progress}>
        {index + 1} / {batch.length}
      </Text>

      <GestureDetector gesture={cardGesture}>
        <View style={styles.cardContainer}>
          <Animated.View
            style={[styles.face, frontStyle]}
            pointerEvents={showBack ? 'none' : 'auto'}
          >
            <SpeakerButton text={card.front} language="nb-NO" style={styles.speaker} />
            <Text style={styles.faceText}>{card.front}</Text>
            <Text style={styles.tapHint}>Tap to flip · swipe to navigate</Text>
          </Animated.View>
          <Animated.View
            style={[styles.face, styles.faceBack, backStyle]}
            pointerEvents={showBack ? 'auto' : 'none'}
          >
            <SpeakerButton text={card.back} language="en-US" style={styles.speaker} />
            <Text style={styles.faceText}>{card.back}</Text>
            <Text style={styles.tapHint}>Tap to flip · swipe to navigate</Text>
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.ratingRow}>
        <Button title="Hard" color={colors.hard} style={styles.ratingBtn} onPress={() => handleRate('hard')} />
        <Button title="Close" color={colors.close} style={styles.ratingBtn} onPress={() => handleRate('close')} />
        <Button title="Fine" color={colors.fine} style={styles.ratingBtn} onPress={() => handleRate('fine')} />
        <Button title="Easy" color={colors.easy} style={styles.ratingBtn} onPress={() => handleRate('easy')} />
      </View>
    </View>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progress: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  cardContainer: {
    flex: 1,
    marginBottom: spacing.lg,
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceBack: {
    backgroundColor: colors.bg,
  },
  speaker: { position: 'absolute', bottom: spacing.md, right: spacing.md },
  faceText: { fontSize: 24, fontWeight: '600', color: colors.text, textAlign: 'center' },
  tapHint: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    textAlign: 'center',
    fontSize: 14,
    color: colors.textMuted,
  },
  ratingRow: { flexDirection: 'row', gap: spacing.xs },
  ratingBtn: { flex: 1, paddingHorizontal: spacing.xs },
  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  summaryTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  summarySub: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  summaryRow: { flexDirection: 'row', marginTop: spacing.lg },
  summaryStat: { flex: 1 },
  summaryValue: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  summaryLabel: { fontSize: 14, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  summaryActions: { gap: spacing.sm, marginTop: spacing.lg },
});
