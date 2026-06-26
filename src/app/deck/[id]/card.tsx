import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { addCard, deleteCard, editCard, getCard } from '@/db/cards';
import { colors, radius, spacing } from '@/theme';

export default function CardScreen() {
  const { id, cardId } = useLocalSearchParams<{ id: string; cardId?: string }>();
  const deckId = Number(id);
  const editingId = cardId ? Number(cardId) : null;
  const router = useRouter();

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);

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
          await deleteCard(editingId);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ title: editingId != null ? 'Edit card' : 'Add card' }} />

        <Text style={styles.label}>Front</Text>
        <TextInput
          style={styles.input}
          value={front}
          onChangeText={setFront}
          placeholder="Question / prompt"
          placeholderTextColor={colors.textMuted}
          multiline
          autoFocus={editingId == null}
        />

        <Text style={styles.label}>Back</Text>
        <TextInput
          style={styles.input}
          value={back}
          onChangeText={setBack}
          placeholder="Answer"
          placeholderTextColor={colors.textMuted}
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
            <Button title="Delete card" variant="danger" onPress={confirmDelete} />
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
  label: { fontSize: 14, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
