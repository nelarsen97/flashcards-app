import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { EraserButton } from '@/components/EraserButton';
import { Screen } from '@/components/Screen';
import { addCard, deleteCard, editCard, findDuplicateFront, getCard } from '@/db/cards';
import { colors, fonts, radius, spacing } from '@/theme';

export default function CardScreen() {
  const { id, cardId } = useLocalSearchParams<{ id: string; cardId?: string }>();
  const deckId = Number(id);
  const editingId = cardId ? Number(cardId) : null;
  const router = useRouter();

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  // Name of a deck already holding a card with this front, or null. Advisory only.
  const [duplicateDeck, setDuplicateDeck] = useState<string | null>(null);

  useEffect(() => {
    if (editingId != null) {
      getCard(editingId)
        .then((c) => {
          if (c) {
            setFront(c.front);
            setBack(c.back);
          }
        })
        .catch(console.error);
    }
  }, [editingId]);

  // Debounced, async lookup for an existing card with the same front (any deck).
  // Add mode only — editing would match the card against itself. The timeout
  // cleanup is the debounce; `cancelled` guards a late resolve from stale state.
  useEffect(() => {
    if (editingId != null) return;
    const term = front.trim();
    let cancelled = false;
    // An empty field clears the warning immediately; a non-empty one debounces
    // the DB lookup. Both run off a timer so no setState fires synchronously here.
    const t = setTimeout(
      () => {
        if (term === '') {
          if (!cancelled) setDuplicateDeck(null);
          return;
        }
        findDuplicateFront(term)
          .then((m) => {
            if (!cancelled) setDuplicateDeck(m?.deckName ?? null);
          })
          .catch(console.error);
      },
      term === '' ? 0 : 350
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [front, editingId]);

  const canSave = front.trim().length > 0 && back.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (editingId != null) {
        await editCard(editingId, front, back);
      } else {
        await addCard(deckId, front, back);
      }
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert('Save failed', 'Could not save the card. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // "Save & add another" — only in add mode; keeps the user on this screen.
  async function handleSaveAndNew() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await addCard(deckId, front, back);
      setFront('');
      setBack('');
    } catch (e) {
      console.error(e);
      Alert.alert('Save failed', 'Could not save the card. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (editingId == null) return;
    Alert.alert('Delete card', 'Delete this card? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCard(editingId);
            router.back();
          } catch (e) {
            console.error(e);
            Alert.alert('Delete failed', 'Could not delete the card. Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <Screen surface="paper" title={editingId != null ? 'Edit card' : 'Add card'} onBack>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Front</Text>
        <TextInput
          style={styles.input}
          value={front}
          onChangeText={setFront}
          multiline
          autoFocus={editingId == null}
        />
        {duplicateDeck ? (
          <Text style={styles.warning}>Already exists in “{duplicateDeck}”</Text>
        ) : null}

        <Text style={styles.label}>Back</Text>
        <TextInput
          style={styles.input}
          value={back}
          onChangeText={setBack}
          multiline
        />

        <View style={styles.actions}>
          <Button
            title={editingId != null ? 'Save changes' : 'Save card'}
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
          />
          {editingId == null ? (
            <Button title="Save & add another" variant="secondary" onPress={handleSaveAndNew} disabled={!canSave} />
          ) : (
            <EraserButton title="Delete card" onPress={confirmDelete} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // flex:1 bounds the ScrollView inside <Screen> so its content can scroll and
  // its end clears the nav bar via the Screen's safe-area inset.
  scroll: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 18, fontFamily: fonts.heading, color: colors.text, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.card,
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
  warning: { fontSize: 14, fontFamily: fonts.body, color: colors.eraser, marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
