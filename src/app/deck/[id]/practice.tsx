/* eslint-disable react-hooks/immutability -- the swipe pager writes the track's
   Reanimated shared value (`tx`) imperatively so it can follow the finger; the
   React Compiler immutability rule doesn't model that idiom. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
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
import { PencilButton } from '@/components/PencilButton';
import { Screen } from '@/components/Screen';
import { SpeakerButton, prewarmSpeech } from '@/components/SpeakerButton';
import { Card, editCard, getDueCards, getLearnedCards, nextReview, rateCard, Rating } from '@/db/cards';
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
// a slice of *both* neighbours spills into view past a gap — the previous card on
// the left and the next card on the right — instead of the current card filling
// the viewport edge-to-edge. CARD_PEEK is how much of a neighbour shows; CARD_GAP
// is the space between adjacent cards. The current card rests inset from the left
// by CARD_INSET (one peek + one gap) so the previous card's peek sits to its left
// and, symmetrically, the next card's peek to its right. The per-card stride (the
// distance the track travels between cards) is `strideFor(width)`, and a card is
// `stride - CARD_GAP` wide.
const CARD_PEEK = spacing.lg;
const CARD_GAP = spacing.md;
const CARD_INSET = CARD_PEEK + CARD_GAP;
// Card height as a multiple of its width — a little taller than square (a Post-It
// with room to write), without going back to the full-height portrait card.
const CARD_ASPECT = 1.25;

// The track travel per card: the viewport minus a peek + gap on each side. Marked
// a worklet so the pan gesture (UI thread) and the JS-thread settle/layout paths
// can share it.
const strideFor = (w: number) => {
  'worklet';
  return w - 2 * CARD_PEEK - CARD_GAP;
};
// The track's resting translateX for card `target`: card 0 rests at +CARD_INSET
// (inset from the left so its previous-card peek shows), each later card a stride
// further left.
const restOffset = (target: number, w: number) => {
  'worklet';
  return CARD_INSET - target * strideFor(w);
};

type Phase = 'loading' | 'practice' | 'summary';
type Tally = { hard: number; fine: number; easy: number };
// One row in the post-session summary: a word seen this batch with its Leitner
// level before and after. `before === after` means it was swiped past (or rated
// with no net change), and the row shows a single current-level badge.
type ReviewedCard = { id: number; front: string; before: number; after: number };

// Randomly start a card on its front or back, so practice isn't always
// front-first. true = show the back first.
const randomFace = () => Math.random() < 0.5;

export default function PracticeScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const deckId = Number(id);
  const router = useRouter();
  // Opt-in "study learned cards" path (reached from the deck's Learned filter):
  // the session draws from the not-yet-due cards instead of the due ones.
  const learnedMode = mode === 'learned';
  const title = learnedMode ? 'Practice learned' : 'Practice';

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
  // True while a rating's DB write is in flight, so the Hard/Good/Easy buttons
  // disable themselves and a fast double-tap can't rate the same card twice (or
  // rate during the slide to the next card).
  const [isRating, setIsRating] = useState(false);

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
  // i is restOffset(i, width); the end-of-batch slide parks it one stride past the
  // last card so it slides fully off.
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
  // stride (one card + gap), not the full viewport width, so both neighbours peek.
  const settleTo = useCallback(
    (target: number, animate: boolean) => {
      const dest = restOffset(target, width);
      tx.value = animate ? withTiming(dest, { duration: SLIDE_MS }) : dest;
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
    // Snap the track to the first card's resting inset, not sliding in from the
    // old one. Card 0's offset is CARD_INSET regardless of width, so this stays
    // correct before the first layout pass measures the viewport.
    tx.value = CARD_INSET;
    setRatings({});
    setPhase(next.length === 0 ? 'summary' : 'practice');
  }, [tx]);

  // Warm the text-to-speech engine on entry so the first speaker-button tap of
  // the session isn't swallowed by Android's TTS cold-start.
  useEffect(() => {
    prewarmSpeech();
  }, []);

  useEffect(() => {
    // Snapshot the session's cards once, then deal the first batch — the due set
    // normally, or the learned (not-yet-due) set in the opt-in study-ahead mode.
    // `phase` already starts at 'loading', so the screen shows the spinner until
    // this resolves — no synchronous setState needed here. `cancelled` guards
    // against a resolve after unmount (exiting practice before the load lands).
    let cancelled = false;
    const fetchCards = learnedMode ? getLearnedCards : getDueCards;
    fetchCards(deckId).then((cards) => {
      if (cancelled) return;
      queue.current = cards;
      loadBatch();
    });
    return () => {
      cancelled = true;
    };
  }, [deckId, learnedMode, loadBatch]);

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
      tx.value = withTiming(restOffset(batch.length, width), { duration: SLIDE_MS }, (finished) => {
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
    if (!card || isRating) return;
    setIsRating(true);
    try {
      // Rate from the card's original level (its loaded value, never mutated), so
      // a re-rate after swiping back replaces the earlier rating instead of
      // stacking.
      await rateCard(card.id, level, card.familiarity);
      setRatings((r) => ({ ...r, [index]: level }));

      if (index + 1 < batch.length) goTo(index + 1);
      else endSession();
    } finally {
      setIsRating(false);
    }
  }

  if (phase === 'loading') {
    return (
      <Screen style={styles.centered} surface="paper" title={title} onBack>
        <ActivityIndicator color={colors.ferrule} />
      </Screen>
    );
  }

  if (phase === 'summary') {
    // The tally counts each rated card once under its final rating (a re-rated
    // card has a single entry in `ratings`); cards only swiped past aren't rated.
    const tally: Tally = { hard: 0, fine: 0, easy: 0 };
    for (const level of Object.values(ratings)) tally[level] += 1;
    const reviewed = Object.keys(ratings).length;
    // Every card dealt this batch, in the order seen. A rated card carries its
    // level change: `before` is its loaded familiarity, `after` comes from
    // `nextReview` (whose familiarity output ignores the `now` arg — only due_at
    // uses it, and we discard that — so passing 0 keeps this pure for the render).
    // A card only swiped past keeps its level, so before === after and its row
    // renders a single current-level badge instead of a transition.
    const reviewedCards: ReviewedCard[] = batch.map((card, i) => {
      const rating = ratings[i];
      const before = card.familiarity;
      const after = rating ? nextReview(rating, before, 0).familiarity : before;
      return { id: card.id, front: card.front, before, after };
    });
    return (
      <Screen style={styles.container} bottomOffset={spacing.md} surface="paper" title="Session summary" onBack>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {batch.length === 0 ? 'Nothing to practice' : 'Session complete'}
          </Text>
          {batch.length === 0 ? (
            <Text style={styles.summarySub}>
              {learnedMode
                ? 'There are no learned cards in this deck right now.'
                : 'There are no due cards in this deck right now.'}
            </Text>
          ) : reviewed > 0 ? (
            <View style={styles.summaryRow}>
              <SummaryStat label="Hard" value={tally.hard} color={colors.hard} />
              <SummaryStat label="Good" value={tally.fine} color={colors.good} />
              <SummaryStat label="Easy" value={tally.easy} color={colors.easy} />
            </View>
          ) : null}
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
            <PencilButton
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
      const maxTx = restOffset(0, width);
      const minTx = restOffset(batch.length - 1, width);
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

  // Size each card off the measured width — a Post-It a little taller than square
  // (CARD_ASPECT) rather than filling the whole column height. The viewport takes
  // this height (below), and a flex spacer above pushes the card + rating row
  // down toward the bottom of the screen.
  const cardW = width > 0 ? strideFor(width) - CARD_GAP : 0;
  const cardH = cardW * CARD_ASPECT;

  return (
    <Screen style={styles.container} bottomOffset={spacing.md} surface="paper" title={title} onBack>
      {/* Spacers above (2) and below (1) park the card + rating row in the lower
          middle of the screen rather than at the very top or bottom. */}
      <View style={styles.spacerTop} />
      <Text style={styles.progress}>
        {index + 1} / {batch.length}
      </Text>

      <View
        style={[styles.viewport, { height: cardH }]}
        onLayout={(e) => {
          // Measure the viewport and re-align the track to the current card. This
          // is the only place width changes (first layout, rotation); a live drag
          // never resizes the viewport, so it can't fight the gesture.
          const w = e.nativeEvent.layout.width;
          setWidth(w);
          tx.value = restOffset(index, w);
        }}
      >
        {width > 0 ? (
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[styles.track, { width: batch.length * strideFor(width) }, trackStyle]}
            >
              {batch.map((c) => (
                <PracticeCard
                  key={c.id}
                  card={c}
                  cardWidth={cardW}
                  onEdit={openEdit}
                />
              ))}
            </Animated.View>
          </GestureDetector>
        ) : null}
      </View>

      <View style={styles.ratingRow}>
        <Button title="Hard" color={colors.hard} style={styles.ratingBtn} disabled={isRating} onPress={() => handleRate('hard')} />
        <Button title="Good" color={colors.good} style={styles.ratingBtn} disabled={isRating} onPress={() => handleRate('fine')} />
        <Button title="Easy" color={colors.easy} style={styles.ratingBtn} disabled={isRating} onPress={() => handleRate('easy')} />
      </View>
      <View style={styles.flex1} />

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
// level on the right. A card whose level moved shows the change as two badges
// (before → after); a card swiped past (or rated with no net change) shows just
// its current level as one badge — no "Lvl 0 → Lvl 0" transition.
function ReviewedRow({ card }: { card: ReviewedCard }) {
  const changed = card.before !== card.after;
  return (
    <View style={styles.reviewedRow}>
      <Text style={styles.reviewedFront} numberOfLines={1}>
        {card.front}
      </Text>
      <View style={styles.reviewedChange}>
        {changed ? (
          <>
            <LevelBadge level={card.before} />
            <Text style={styles.reviewedArrow}>→</Text>
            <LevelBadge level={card.after} />
          </>
        ) : (
          <LevelBadge level={card.after} />
        )}
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
    color: colors.text,
    marginBottom: spacing.md,
  },
  // Clips the off-screen cards to the viewport. The negative side margins cancel
  // the screen's horizontal padding so the viewport reaches both screen edges,
  // letting each neighbour's peek spill right up to the edge instead of stopping
  // at the gutter — symmetric on the left (previous card) and right (next card).
  // Height is set inline to the square card height (see render) rather than
  // flex:1, so the rating row sits just below the card instead of at the screen
  // bottom.
  viewport: {
    overflow: 'hidden',
    marginBottom: spacing.lg,
    marginLeft: -spacing.md,
    marginRight: -spacing.md,
  },
  // The row of cards; its width spans the whole batch, translated by offset. The
  // gap sets the spacing between adjacent cards in the carousel.
  track: {
    flexDirection: 'row',
    height: '100%',
    gap: CARD_GAP,
  },
  // One card-width slot holding a card's two faces (narrower than the viewport so
  // both neighbours peek).
  cardSlot: {
    height: '100%',
  },
  // A blank yellow Post-It: sticky-note yellow with a faint warm edge.
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    backgroundColor: colors.postit,
    borderWidth: 1,
    borderColor: colors.postitEdge,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  faceBack: {
    // A hair deeper canary — reads as the same note in shadow, marking the answer
    // side without the distraction of a different hue.
    backgroundColor: colors.postitBack,
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
    color: colors.text,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
  reviewedFront: { flex: 1, fontSize: 16, fontFamily: fonts.bodyMedium, color: colors.text },
  reviewedChange: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reviewedArrow: { fontSize: 14, fontFamily: fonts.bodyBold, color: colors.text },
  levelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  levelText: { fontSize: 12, fontFamily: fonts.bodyBold, color: colors.text },
  flex1: { flex: 1 },
  // Top spacer takes twice the slack of the bottom one, so the card + rating row
  // settle in the lower middle of the screen.
  spacerTop: { flex: 2 },
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
