import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { SpeakerButton } from '@/components/SpeakerButton';
import { Card, FamiliarityLevel, getDueCards, rateCard } from '@/db/cards';
import { colors, radius, spacing } from '@/theme';

const BATCH_SIZE = 10;

type Phase = 'loading' | 'practice' | 'summary';
type Tally = { hard: number; close: number; fine: number; easy: number };

const emptyTally: Tally = { hard: 0, close: 0, fine: 0, easy: 0 };

export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('loading');
  const [batch, setBatch] = useState<Card[]>([]);
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [moreDue, setMoreDue] = useState(false);
  // false = front showing, true = back showing.
  const [showBack, setShowBack] = useState(false);
  // Whether the next face change should animate. Tapping flips with animation;
  // advancing to the next card resets to the front with no animation, so the
  // flip-back never plays over the next card's text and spoil its answer.
  const [animate, setAnimate] = useState(true);

  // 0 = front, 1 = back. Animates on tap, snaps instantly on card advance.
  const progress = useDerivedValue(() => {
    const target = showBack ? 1 : 0;
    return animate ? withTiming(target, { duration: 250 }) : target;
  });

  // Tap to flip the current card, with animation.
  const toggleFace = useCallback(() => {
    setAnimate(true);
    setShowBack((v) => !v);
  }, []);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  const loadBatch = useCallback(async () => {
    setPhase('loading');
    const cards = await getDueCards(deckId, BATCH_SIZE);
    setBatch(cards);
    setIndex(0);
    setAnimate(false);
    setShowBack(false);
    setTally(emptyTally);
    setPhase(cards.length === 0 ? 'summary' : 'practice');
  }, [deckId]);

  useEffect(() => {
    // Intentional one-time fetch of the first batch on mount. The compiler lint
    // can't tell this apart from a render-loop setState, but it is a deliberate
    // data load, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBatch();
  }, [loadBatch]);

  async function handleRate(level: FamiliarityLevel) {
    const card = batch[index];
    if (!card) return;
    await rateCard(card.id, level);

    const nextTally = { ...tally, [level]: tally[level] + 1 };
    setTally(nextTally);

    if (index + 1 < batch.length) {
      // Snap straight to the front of the next card — no flip animation, so the
      // back never rotates into view over the new card's text.
      setAnimate(false);
      setShowBack(false);
      setIndex(index + 1);
    } else {
      // Batch finished — are there still due cards left for a next round?
      const remaining = await getDueCards(deckId, 1);
      setMoreDue(remaining.length > 0);
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
    const reviewed = tally.hard + tally.close + tally.fine + tally.easy;
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
          {moreDue ? (
            <Button title="Practice next 10" onPress={loadBatch} />
          ) : null}
          <Button title="Done" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // phase === 'practice'
  const card = batch[index];
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.md }]}>
      <Stack.Screen options={{ title: 'Practice' }} />
      <Text style={styles.progress}>
        {index + 1} / {batch.length}
      </Text>

      <Pressable style={styles.cardContainer} onPress={toggleFace}>
        <Animated.View style={[styles.face, frontStyle]}>
          <SpeakerButton text={card.front} language="nb-NO" style={styles.speaker} />
          <Text style={styles.faceText}>{card.front}</Text>
          <Text style={styles.tapHint}>Tap to flip</Text>
        </Animated.View>
        <Animated.View style={[styles.face, styles.faceBack, backStyle]}>
          <SpeakerButton text={card.back} language="en-US" style={styles.speaker} />
          <Text style={styles.faceText}>{card.back}</Text>
        </Animated.View>
      </Pressable>

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
  speaker: { position: 'absolute', top: spacing.md, right: spacing.md },
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
