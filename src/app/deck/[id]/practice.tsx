/* eslint-disable react-hooks/immutability -- the swipe pager writes the track's
   Reanimated shared value (`tx`) imperatively so it can follow the finger; the
   React Compiler immutability rule doesn't model that idiom. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  DerivedValue,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { SpeakerButton, prewarmSpeech } from '@/components/SpeakerButton';
import { Card, editCard, getDueCards, nextReview, rateCard, Rating } from '@/db/cards';
import { colors, fonts, levelColor, radius, shadow, spacing } from '@/theme';

const BATCH_SIZE = 10;
// Horizontal travel (px) past which a pan is treated as a navigation swipe.
const SWIPE_THRESHOLD = 60;
// A flick faster than this (px/s) navigates even without crossing the distance
// threshold, so a quick swipe still slides to the neighbour.
const FLICK_VELOCITY = 500;
// How long a slide or a flip takes.
const SLIDE_MS = 250;
// The cards sit in a peeking carousel: each card is narrower than the viewport so
// the next card's edge spills into view past a gap on the right, instead of the
// current card filling the viewport edge-to-edge. CARD_PEEK is how much of the
// next card shows; CARD_GAP is the space between adjacent cards. The per-card
// stride (the distance the track travels between cards) is `width - CARD_PEEK`,
// and a card is `stride - CARD_GAP` wide.
const CARD_PEEK = spacing.lg;
const CARD_GAP = spacing.md;

type Phase = 'loading' | 'practice' | 'summary';
type Tally = { hard: number; fine: number; easy: number };
// One row in the post-session summary: a reviewed word and how its Leitner level
// moved (`before` → `after`), derived from the rating in the summary phase.
type ReviewedCard = { id: number; front: string; before: number; after: number };

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

  // The cards sit side by side in a horizontal track; `width` is the viewport
  // width measured on layout (0 until the first pass). Each card occupies one
  // stride (`width - CARD_PEEK`) so the next card peeks past the gap; the track
  // slides by animating its translateX to the current card's resting offset.
  const [width, setWidth] = useState(0);
  // The track's horizontal offset, written imperatively so it can follow the
  // finger during a drag and animate to rest on release. Resting offset for card
  // i is -i * stride; the end-of-batch slide parks it at -batch.length * stride.
  const tx = useSharedValue(0);
  // The track offset captured when a drag starts, so onUpdate is relative to it.
  const dragStart = useSharedValue(0);

  // End the session and show the summary. `remainingDue` was set when this batch
  // was dealt and the session deck doesn't grow mid-batch, so it's already right.
  const endSession = useCallback(() => {
    setPhase('summary');
  }, []);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  // Animate (or snap) the track to a card's resting offset. Cards advance by the
  // stride (one card + gap), not the full viewport width, so the next card peeks.
  const settleTo = useCallback(
    (target: number, animate: boolean) => {
      const stride = width - CARD_PEEK;
      tx.value = animate
        ? withTiming(-target * stride, { duration: SLIDE_MS })
        : -target * stride;
    },
    [tx, width]
  );

  // Deal the next cards off the top of the session deck. No DB query — the deck
  // was snapshotted at session start, so a card already dealt never comes back.
  const loadBatch = useCallback(() => {
    const next = queue.current.slice(0, BATCH_SIZE);
    queue.current = queue.current.slice(BATCH_SIZE);
    setBatch(next);
    setRemainingDue(queue.current.length);
    setIndex(0);
    tx.value = 0; // snap the track to the first card, don't slide in from the old one
    setRatings({});
    setPhase(next.length === 0 ? 'summary' : 'practice');
  }, [tx]);

  // Warm the text-to-speech engine on entry so the first speaker-button tap of
  // the session isn't swallowed by Android's TTS cold-start.
  useEffect(() => {
    prewarmSpeech();
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
  const goTo = useCallback(
    (target: number) => {
      setIndex(target);
      settleTo(target, true);
    },
    [settleTo]
  );
  // Swiping forward past the last card skips it (no rating) and slides off to the
  // session summary; swiping back before the first card is a no-op.
  const goNext = useCallback(() => {
    if (index + 1 >= batch.length) {
      // Slide the last card off-screen, then drop into the summary once it lands.
      const stride = width - CARD_PEEK;
      tx.value = withTiming(-batch.length * stride, { duration: SLIDE_MS }, (finished) => {
        if (finished) runOnJS(endSession)();
      });
    } else {
      goTo(index + 1);
    }
  }, [index, batch.length, width, tx, goTo, endSession]);
  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [index, goTo]);
  // Release below the navigation threshold: rubber-band back to the current card.
  const settleBack = useCallback(() => {
    settleTo(index, true);
  }, [settleTo, index]);

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

    if (index + 1 < batch.length) goTo(index + 1);
    else endSession();
  }

  if (phase === 'loading') {
    return (
      <Screen style={styles.centered} title="Practice" onBack>
        <ActivityIndicator color={colors.ferrule} />
      </Screen>
    );
  }

  if (phase === 'summary') {
    // Count each rated card once under its final rating (a re-rated card has a
    // single entry in `ratings`). Cards only swiped past aren't in `ratings`.
    const tally: Tally = { hard: 0, fine: 0, easy: 0 };
    for (const level of Object.values(ratings)) tally[level] += 1;
    const reviewed = Object.keys(ratings).length;
    // The per-word review list, in batch order. `batch[i].familiarity` is the
    // "before" level (loaded once, never mutated); `nextReview` derives the
    // "after" level from the rating. Its familiarity output ignores the `now`
    // argument (only due_at uses it, and we discard that), so we pass 0 — keeping
    // this derivation pure for the render. No new state and no DB read.
    const reviewedCards: ReviewedCard[] = [];
    for (let i = 0; i < batch.length; i++) {
      const rating = ratings[i];
      if (!rating) continue;
      const before = batch[i].familiarity;
      const after = nextReview(rating, before, 0).familiarity;
      reviewedCards.push({ id: batch[i].id, front: batch[i].front, before, after });
    }
    return (
      <Screen style={styles.container} bottomOffset={spacing.md} title="Session summary" onBack>
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

        {reviewedCards.length > 0 ? (
          <ScrollView style={styles.reviewedList}>
            <Text style={styles.reviewedHeading}>Reviewed</Text>
            {reviewedCards.map((c) => (
              <ReviewedRow key={c.id} card={c} />
            ))}
          </ScrollView>
        ) : null}

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

  // phase === 'practice'. The viewport clips the off-screen cards; dragging
  // horizontally pulls the whole track under the finger (left → next, right →
  // prev) and it settles to the nearest card on release. Each card's own tap (in
  // PracticeCard) flips it — activeOffsetX keeps small taps from being stolen as a
  // drag, the role the old Race(pan, tap) played.
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onStart(() => {
      dragStart.value = tx.value;
    })
    .onUpdate((e) => {
      // The track follows the finger; rubber-band past the first/last card so the
      // edges feel bounded instead of dragging into empty space. Cards advance by
      // the stride (one card + gap), not the full viewport width.
      const maxTx = 0;
      const minTx = -(batch.length - 1) * (width - CARD_PEEK);
      let next = dragStart.value + e.translationX;
      if (next > maxTx) next = maxTx + (next - maxTx) * 0.3;
      else if (next < minTx) next = minTx + (next - minTx) * 0.3;
      tx.value = next;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -FLICK_VELOCITY) runOnJS(goNext)();
      else if (e.translationX > SWIPE_THRESHOLD || e.velocityX > FLICK_VELOCITY) runOnJS(goPrev)();
      else runOnJS(settleBack)();
    });

  return (
    <Screen style={styles.container} bottomOffset={spacing.md} title="Practice" onBack>
      <Text style={styles.progress}>
        {index + 1} / {batch.length}
      </Text>

      <View
        style={styles.viewport}
        onLayout={(e) => {
          // Measure the viewport and re-align the track to the current card. This
          // is the only place width changes (first layout, rotation); a live drag
          // never resizes the viewport, so it can't fight the gesture.
          const w = e.nativeEvent.layout.width;
          setWidth(w);
          tx.value = -index * (w - CARD_PEEK);
        }}
      >
        {width > 0 ? (
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[styles.track, { width: batch.length * (width - CARD_PEEK) }, trackStyle]}
            >
              {batch.map((c) => (
                <PracticeCard
                  key={c.id}
                  card={c}
                  cardWidth={width - CARD_PEEK - CARD_GAP}
                  onEdit={openEdit}
                />
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
  cardWidth,
  onEdit,
}: {
  card: Card;
  cardWidth: number;
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
      <View style={[styles.cardSlot, { width: cardWidth }]}>
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

// A single reviewed word in the summary list: the front on the left, and its
// level change on the right as two color-coded badges (before → after).
function ReviewedRow({ card }: { card: ReviewedCard }) {
  return (
    <View style={styles.reviewedRow}>
      <Text style={styles.reviewedFront} numberOfLines={1}>
        {card.front}
      </Text>
      <View style={styles.reviewedChange}>
        <LevelBadge level={card.before} />
        <Text style={styles.reviewedArrow}>→</Text>
        <LevelBadge level={card.after} />
      </View>
    </View>
  );
}

// A small "Lvl N" pill tinted by the familiarity ramp (matches the deck view).
function LevelBadge({ level }: { level: number }) {
  return (
    <View style={[styles.levelBadge, { backgroundColor: levelColor(level) }]}>
      <Text style={styles.levelText}>Lvl {level}</Text>
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
  // Bottom padding is owned by <Screen> (safe-area inset + spacing.md offset).
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progress: {
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    marginBottom: spacing.md,
  },
  // Clips the off-screen cards to the viewport. The negative right margin cancels
  // the screen's right padding so the viewport reaches the screen edge, letting
  // the next card's peek spill right up to it instead of stopping at the gutter.
  viewport: {
    flex: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    marginRight: -spacing.md,
  },
  // The row of cards; its width spans the whole batch, translated by offset. The
  // gap sets the spacing between adjacent cards in the carousel.
  track: {
    flexDirection: 'row',
    height: '100%',
    gap: CARD_GAP,
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
  // The per-word reviewed list sits between the tally card and the actions, and
  // takes the remaining height so it scrolls while the buttons stay pinned.
  reviewedList: { flex: 1, marginTop: spacing.lg },
  reviewedHeading: {
    fontSize: 18,
    fontFamily: fonts.heading,
    color: colors.chalk,
    marginBottom: spacing.sm,
  },
  reviewedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  reviewedFront: { flex: 1, fontSize: 16, fontFamily: fonts.bodyMedium, color: colors.chalk },
  reviewedChange: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reviewedArrow: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.chalk },
  levelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  levelText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.text },
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
