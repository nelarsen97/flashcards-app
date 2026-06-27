import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  DerivedValue,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SpeakerButton } from '@/components/SpeakerButton';
import { Card, editCard, getDueCards, rateCard, Rating } from '@/db/cards';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

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

  // Inline card editing. `editing` is the card whose front/back is open in the
  // modal (null = closed); the drafts hold the in-progress text. Tracking the
  // card by identity (not the current index) keeps the save targeting the right
  // card regardless of where the pencil was tapped.
  const [editing, setEditing] = useState<Card | null>(null);
  const [draftFront, setDraftFront] = useState('');
  const [draftBack, setDraftBack] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

  // Open the edit modal seeded with the tapped card's current text.
  const openEdit = useCallback((card: Card) => {
    setDraftFront(card.front);
    setDraftBack(card.back);
    setEditing(card);
  }, []);

  // Persist the edit and reflect it in the live batch so the card updates in
  // place (same key, so PracticeCard re-renders without losing its flip state).
  // Only front/back change; familiarity/due_at are untouched by editCard.
  async function saveEdit() {
    if (!editing || savingEdit) return;
    const front = draftFront.trim();
    const back = draftBack.trim();
    if (!front || !back) return;
    setSavingEdit(true);
    try {
      await editCard(editing.id, front, back);
      setBatch((b) => b.map((c) => (c.id === editing.id ? { ...c, front, back } : c)));
      setEditing(null);
    } finally {
      setSavingEdit(false);
    }
  }

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
        <ActivityIndicator color={colors.ferrule} />
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
      <Screen style={styles.container} bottomOffset={spacing.md}>
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
              <SummaryStat label="Good" value={tally.fine} color={colors.good} />
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
      </Screen>
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
    <Screen style={styles.container} bottomOffset={spacing.md}>
      <Stack.Screen options={{ title: 'Practice' }} />
      <Text style={styles.progress}>
        {index + 1} / {batch.length}
      </Text>

      <View style={styles.viewport} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.track, { width: batch.length * width }, trackStyle]}>
              {batch.map((c) => (
                <PracticeCard key={c.id} card={c} width={width} onEdit={openEdit} />
              ))}
            </Animated.View>
          </GestureDetector>
        ) : null}
      </View>

      <View style={styles.ratingRow}>
        <Button title="Hard" color={colors.hard} style={styles.ratingBtn} onPress={() => handleRate('hard')} />
        <Button title="Good" color={colors.good} style={styles.ratingBtn} onPress={() => handleRate('fine')} />
        <Button title="Easy" color={colors.easy} style={styles.ratingBtn} onPress={() => handleRate('easy')} />
      </View>

      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit card</Text>
            <Text style={styles.fieldLabel}>Front</Text>
            <TextInput
              style={styles.modalInput}
              value={draftFront}
              onChangeText={setDraftFront}
              placeholder="Front"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Text style={styles.fieldLabel}>Back</Text>
            <TextInput
              style={styles.modalInput}
              value={draftBack}
              onChangeText={setDraftBack}
              placeholder="Back"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="secondary"
                style={styles.flex1}
                onPress={() => setEditing(null)}
              />
              <Button
                title="Save"
                style={styles.flex1}
                onPress={saveEdit}
                disabled={!draftFront.trim() || !draftBack.trim()}
                loading={savingEdit}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// One card in the track. It owns its own face: a random starting side picked once
// (so practice isn't always front-first), then retained — slide away and back and
// it's still on the side you left it. The first tap turns on animation, so the
// card flips smoothly without spinning itself when it first slides into view.
function PracticeCard({
  card,
  width,
  onEdit,
}: {
  card: Card;
  width: number;
  onEdit: (card: Card) => void;
}) {
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
  // Each face's speaker and pencil buttons live inside the card, under the flip's
  // detector. Each gets a native gesture the flip yields to (wired up by
  // CardCorner), so tapping a button runs its press (pronounce / edit) instead of
  // flipping, while taps elsewhere on the card still flip. A GestureDetector can't
  // share a gesture instance, so it's one per button per face — all four are
  // registered with the flip below.
  const speakerFront = Gesture.Native();
  const speakerBack = Gesture.Native();
  const pencilFront = Gesture.Native();
  const pencilBack = Gesture.Native();
  const tap = Gesture.Tap()
    .onEnd(() => runOnJS(toggle)())
    .requireExternalGestureToFail(speakerFront, speakerBack, pencilFront, pencilBack);

  return (
    <GestureDetector gesture={tap}>
      <View style={[styles.cardSlot, { width }]}>
        <CardFace
          card={card}
          onEdit={onEdit}
          text={card.front}
          language="nb-NO"
          progress={progress}
          active={!showBack}
          pencilGesture={pencilFront}
          speakerGesture={speakerFront}
        />
        <CardFace
          card={card}
          onEdit={onEdit}
          text={card.back}
          language="en-US"
          progress={progress}
          active={showBack}
          back
          pencilGesture={pencilBack}
          speakerGesture={speakerBack}
        />
      </View>
    </GestureDetector>
  );
}

// One side of a practice card. The two faces are stacked and back-face-hidden;
// `back` adds the 180° rotation and the back background, and `active` makes this
// the side that receives touches (the hidden one is pointerEvents="none").
function CardFace({
  card,
  onEdit,
  text,
  language,
  progress,
  active,
  back,
  pencilGesture,
  speakerGesture,
}: {
  card: Card;
  onEdit: (card: Card) => void;
  text: string;
  language: string;
  progress: DerivedValue<number>;
  active: boolean;
  back?: boolean;
  pencilGesture: ReturnType<typeof Gesture.Native>;
  speakerGesture: ReturnType<typeof Gesture.Native>;
}) {
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${progress.value * 180 + (back ? 180 : 0)}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[styles.face, back && styles.faceBack, faceStyle]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      <CardRules />
      <CardCorner gesture={pencilGesture} style={styles.pencil}>
        <EditButton card={card} onEdit={onEdit} />
      </CardCorner>
      <CardCorner gesture={speakerGesture} style={styles.speaker}>
        <SpeakerButton text={text} language={language} />
      </CardCorner>
      <Text style={styles.faceText}>{text}</Text>
    </Animated.View>
  );
}

// The ruled-paper lines + red margin rule drawn inside a card face, so each
// flashcard reads like a lined index card. Over-draws past the face height and
// is clipped by the face's overflow:hidden; sits behind the text and buttons and
// never intercepts touches.
function CardRules() {
  const { height } = useWindowDimensions();
  const count = Math.ceil(height / 30);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.cardLine, { top: (i + 1) * 30 }]} />
      ))}
      <View style={styles.cardMargin} />
    </View>
  );
}

// A control pinned to a corner of a card face that must not trigger the flip. The
// caller owns the Gesture.Native() (so the flip can requireExternalGestureToFail
// on it) and the corner positioning; this just wires that gesture to the wrapper.
function CardCorner({
  gesture,
  style,
  children,
}: {
  gesture: ReturnType<typeof Gesture.Native>;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <GestureDetector gesture={gesture}>
      <View style={style}>{children}</View>
    </GestureDetector>
  );
}

// Pencil button shown at the bottom-left of a card face (mirror of the speaker
// button at the bottom-right). Rendered inside a CardCorner, which owns the
// no-flip gesture and the corner positioning, so a direct tap edits the card.
function EditButton({ card, onEdit }: { card: Card; onEdit: (card: Card) => void }) {
  return (
    <Pressable
      onPress={() => onEdit(card)}
      hitSlop={spacing.sm}
      accessibilityRole="button"
      accessibilityLabel="Edit card"
      style={({ pressed }) => [styles.pencilButton, pressed && styles.pencilPressed]}
    >
      <Text style={styles.pencilIcon}>✏️</Text>
    </Pressable>
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
  // Bottom padding is owned by <Screen> (safe-area inset + spacing.md offset).
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progress: {
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fonts.bodyBold,
    color: colors.text,
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
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  faceBack: {
    // A desaturated, cooler card front — reads as the front in shadow, marking
    // the answer side without the distraction of a different hue.
    backgroundColor: colors.cardBack,
  },
  // Faint ruled lines + red margin painted across a card face (index-card look).
  cardLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.paperLine,
  },
  cardMargin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: spacing.xl,
    width: 1.5,
    backgroundColor: colors.marginLine,
  },
  speaker: { position: 'absolute', bottom: spacing.md, right: spacing.md },
  pencil: { position: 'absolute', bottom: spacing.md, left: spacing.md },
  pencilButton: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilPressed: { backgroundColor: colors.bg },
  pencilIcon: { fontSize: 24 },
  faceText: { fontSize: 30, fontFamily: fonts.heading, color: colors.text, textAlign: 'center' },
  ratingRow: { flexDirection: 'row', gap: spacing.xs },
  ratingBtn: { flex: 1, paddingHorizontal: spacing.xs },
  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    ...shadow.card,
  },
  summaryTitle: { fontSize: 26, fontFamily: fonts.heading, color: colors.text, textAlign: 'center' },
  summarySub: { fontSize: 15, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  summaryRow: { flexDirection: 'row', marginTop: spacing.lg },
  summaryStat: { flex: 1 },
  summaryValue: { fontSize: 30, fontFamily: fonts.bodyExtra, textAlign: 'center' },
  summaryLabel: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  summaryActions: { gap: spacing.sm, marginTop: spacing.lg },
  flex1: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  modalTitle: { fontSize: 22, fontFamily: fonts.heading, color: colors.text, marginBottom: spacing.xs },
  fieldLabel: { fontSize: 16, fontFamily: fonts.heading, color: colors.text },
  modalInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
