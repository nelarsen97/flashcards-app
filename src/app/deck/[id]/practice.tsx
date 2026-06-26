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
// A flick faster than this (px/s) navigates even without crossing the distance
// threshold, so a quick swipe still slides to the neighbour.
const FLICK_VELOCITY = 500;
// How long a slide or a flip takes.
const SLIDE_MS = 250;

type Phase = 'loading' | 'practice' | 'summary';
type Tally = { hard: number; fine: number; easy: number };

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

  // The cards sit side by side in a horizontal track, one viewport-width each;
  // `width` is measured on layout (0 until the first pass). The track slides by
  // animating its translateX to the resting position of the current card, -i*width.
  const [width, setWidth] = useState(0);
  // Whether track moves animate. A fresh batch snaps to the first card; once you
  // navigate, every move slides. (Mirrors the per-card flip's animate flag.)
  const [slide, setSlide] = useState(false);
  // Set when swiping forward past the last card: the track slides one slot past
  // the end (the last card off-screen), then drops into the summary.
  const [ending, setEnding] = useState(false);

  // End the session and show the summary. `remainingDue` was set when this batch
  // was dealt and the session deck doesn't grow mid-batch, so it's already right.
  const endSession = useCallback(() => {
    setPhase('summary');
  }, []);

  // Track offset, driven declaratively from state — no imperative writes, so it
  // stays inside what the React Compiler allows. Re-runs whenever the state it
  // reads changes; `slide` picks animate vs. snap, and the off-screen slide
  // (`ending`) ends the session once it lands.
  const offset = useDerivedValue(() => {
    const dest = -(ending ? batch.length : index) * width;
    if (!slide) return dest;
    return withTiming(dest, { duration: SLIDE_MS }, (finished) => {
      if (finished && ending) runOnJS(endSession)();
    });
  });
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  // Deal the next cards off the top of the session deck. No DB query — the deck
  // was snapshotted at session start, so a card already dealt never comes back.
  const loadBatch = useCallback(() => {
    const next = queue.current.slice(0, BATCH_SIZE);
    queue.current = queue.current.slice(BATCH_SIZE);
    setBatch(next);
    setRemainingDue(queue.current.length);
    setIndex(0);
    setSlide(false); // snap the track to the first card, don't slide in from the old one
    setEnding(false);
    setRatings({});
    setPhase(next.length === 0 ? 'summary' : 'practice');
  }, []);

  useEffect(() => {
    // Snapshot the due cards once for this session, then deal the first batch.
    // `phase` already starts at 'loading', so the screen shows the spinner until
    // this resolves — no synchronous setState needed here. `cancelled` guards
    // against a resolve after unmount (exiting practice before the load lands).
    let cancelled = false;
    getDueCards(deckId).then((cards) => {
      if (cancelled) return;
      queue.current = cards;
      loadBatch();
    });
    return () => {
      cancelled = true;
    };
  }, [deckId, loadBatch]);

  // Slide to a card without rating it. Swiping is pure navigation: it never
  // touches familiarity and never writes to the DB. Each card owns its own face,
  // so there is nothing to spoil — the track just translates into place.
  const animateTo = useCallback((target: number) => {
    setSlide(true);
    setIndex(target);
  }, []);
  // Swiping forward past the last card skips it (no rating) and slides off to the
  // session summary; swiping back before the first card is a no-op.
  const goNext = useCallback(() => {
    if (index + 1 >= batch.length) {
      setSlide(true);
      setEnding(true);
    } else {
      animateTo(index + 1);
    }
  }, [index, batch.length, animateTo]);
  const goPrev = useCallback(() => {
    if (index > 0) animateTo(index - 1);
  }, [index, animateTo]);

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

    if (index + 1 < batch.length) animateTo(index + 1);
    else endSession();
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
    const tally: Tally = { hard: 0, fine: 0, easy: 0 };
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

  // phase === 'practice'. The viewport clips the off-screen cards; a horizontal
  // swipe navigates (left → next, right → prev) and the track slides to it. Each
  // card's own tap (in PracticeCard) flips it — activeOffsetX keeps small taps
  // from being stolen as a swipe, the role the old Race(pan, tap) played.
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -FLICK_VELOCITY) runOnJS(goNext)();
      else if (e.translationX > SWIPE_THRESHOLD || e.velocityX > FLICK_VELOCITY) runOnJS(goPrev)();
    });

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.md }]}>
      <Stack.Screen options={{ title: 'Practice' }} />
      <Text style={styles.progress}>
        {index + 1} / {batch.length}
      </Text>

      <View style={styles.viewport} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.track, { width: batch.length * width }, trackStyle]}>
              {batch.map((c) => (
                <PracticeCard key={c.id} card={c} width={width} />
              ))}
            </Animated.View>
          </GestureDetector>
        ) : null}
      </View>

      <View style={styles.ratingRow}>
        <Button title="Hard" color={colors.hard} style={styles.ratingBtn} onPress={() => handleRate('hard')} />
        <Button title="Fine" color={colors.fine} style={styles.ratingBtn} onPress={() => handleRate('fine')} />
        <Button title="Easy" color={colors.easy} style={styles.ratingBtn} onPress={() => handleRate('easy')} />
      </View>
    </View>
  );
}

// One card in the track. It owns its own face: a random starting side picked once
// (so practice isn't always front-first), then retained — slide away and back and
// it's still on the side you left it. The first tap turns on animation, so the
// card flips smoothly without spinning itself when it first slides into view.
function PracticeCard({ card, width }: { card: Card; width: number }) {
  // Number of half-turns; only ever increases, so each tap spins the card forward
  // the same way. Even = front showing, odd = back.
  const [flip, setFlip] = useState(() => (randomFace() ? 1 : 0));
  const [animate, setAnimate] = useState(false);
  const showBack = flip % 2 === 1;

  // Snap to the starting face on mount (animate = false), then animate toward
  // `flip` on every tap. Declarative, so no imperative shared-value writes.
  const progress = useDerivedValue(() =>
    animate ? withTiming(flip, { duration: SLIDE_MS }) : flip,
  );
  const toggle = useCallback(() => {
    setAnimate(true);
    setFlip((f) => f + 1);
  }, []);
  const tap = Gesture.Tap().onEnd(() => runOnJS(toggle)());

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${progress.value * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1000 }, { rotateY: `${progress.value * 180 + 180}deg` }],
  }));

  return (
    <GestureDetector gesture={tap}>
      <View style={[styles.cardSlot, { width }]}>
        <Animated.View style={[styles.face, frontStyle]} pointerEvents={showBack ? 'none' : 'auto'}>
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
  // Clips the off-screen cards so only the current one shows through.
  viewport: {
    flex: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  // The row of cards; its width is batch.length * viewport width, translated by offset.
  track: {
    flexDirection: 'row',
    height: '100%',
  },
  // One viewport-width slot holding a card's two faces.
  cardSlot: {
    height: '100%',
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
