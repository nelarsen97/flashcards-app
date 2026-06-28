import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { importCards } from '@/db/cards';
import { parseDashLines } from '@/lib/csv';
import { colors, fonts, radius, spacing } from '@/theme';

const PLACEHOLDER = 'anstendig - decent\nuventet - unexpected\nå sveise - to weld';

export default function BulkAddScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const router = useRouter();

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  // Live preview of how many lines will turn into cards.
  const rows = parseDashLines(text);

  async function handleSave() {
    if (rows.length === 0 || saving) return;
    setSaving(true);
    try {
      const count = await importCards(deckId, rows);
      router.back();
      Alert.alert('Cards added', `Added ${count} ${count === 1 ? 'card' : 'cards'}.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Add failed', 'Could not add the cards. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Bulk add cards" onBack>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          One card per line. Separate the front and back with a “-”.
        </Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={PLACEHOLDER}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.count}>
          {rows.length === 0
            ? 'No cards yet — add lines like “front - back”.'
            : `${rows.length} ${rows.length === 1 ? 'card' : 'cards'} will be added.`}
        </Text>

        <View style={styles.actions}>
          <Button
            title="Add cards"
            onPress={handleSave}
            disabled={rows.length === 0}
            loading={saving}
          />
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
  hint: { fontSize: 15, fontFamily: fonts.body, color: colors.chalk, lineHeight: 22 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  count: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
