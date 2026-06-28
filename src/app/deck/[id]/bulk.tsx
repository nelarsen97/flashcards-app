import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { importCards } from '@/db/cards';
import { parseDelimited } from '@/lib/csv';
import { colors, fonts, radius, spacing } from '@/theme';

// The character that splits each line into front/back. User-editable; defaults to
// "-" to match the paste example, but works the same for ";"-delimited CSV files.
const DEFAULT_SEPARATOR = '-';

export default function BulkAddScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const router = useRouter();

  const [text, setText] = useState('');
  const [separator, setSeparator] = useState(DEFAULT_SEPARATOR);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // Live preview of how many pasted lines will turn into cards.
  const rows = parseDelimited(text, separator);

  async function handleAdd() {
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

  // Same parser, but the lines come from a picked CSV/text file instead of the box.
  async function handleImportFile() {
    if (importing) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const fileText = await new File(result.assets[0].uri).text();
      const fileRows = parseDelimited(fileText, separator);
      if (fileRows.length === 0) {
        Alert.alert(
          'Nothing imported',
          `No valid “front ${separator} back” lines were found in that file.`
        );
        return;
      }
      const count = await importCards(deckId, fileRows);
      router.back();
      Alert.alert('Import complete', `Imported ${count} ${count === 1 ? 'card' : 'cards'}.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Import failed', 'Could not read that file. Make sure it is a text/CSV file.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Screen title="Add cards in bulk" onBack>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          One card per line — front and back split by the separator below. Paste them in, or
          import a CSV file in the same format.
        </Text>

        <View style={styles.sepRow}>
          <Text style={styles.sepLabel}>Separator</Text>
          <TextInput
            style={styles.sepInput}
            value={separator}
            onChangeText={setSeparator}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={5}
            accessibilityLabel="Separator"
          />
        </View>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={`uventet ${separator} unexpected\nå sveise ${separator} to weld`}
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.count}>
          {rows.length === 0
            ? `No cards yet — add lines like “front ${separator} back”.`
            : `${rows.length} ${rows.length === 1 ? 'card' : 'cards'} will be added.`}
        </Text>

        <View style={styles.actions}>
          <Button
            title="Add cards"
            onPress={handleAdd}
            disabled={rows.length === 0}
            loading={saving}
          />
          <Button
            title="Import from CSV file"
            variant="secondary"
            onPress={handleImportFile}
            loading={importing}
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
  sepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  sepLabel: { fontSize: 15, fontFamily: fonts.bodyMedium, color: colors.chalk },
  sepInput: {
    width: 64,
    textAlign: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
  },
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
