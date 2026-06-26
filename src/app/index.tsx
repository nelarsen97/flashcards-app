import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { createDeck, DeckWithCounts, listDecksWithCounts } from '@/db/decks';
import { exportAllToFile, importFromText, shareBackup } from '@/lib/backup';
import { colors, radius, spacing } from '@/theme';

export default function DecksScreen() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckWithCounts[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const load = useCallback(() => {
    listDecksWithCounts().then(setDecks).catch(console.error);
  }, []);

  // Reload whenever the screen regains focus so counts stay current.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleCreate() {
    const name = newName.trim();
    if (!name || loading) return;
    setLoading(true);
    try {
      const id = await createDeck(name);
      setNewName('');
      load();
      router.push(`/deck/${id}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleBackup() {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const { uri, deckCount } = await exportAllToFile();
      if (deckCount === 0) {
        Alert.alert('Nothing to back up', 'Create a deck or add some cards first.');
        return;
      }
      const shared = await shareBackup(uri);
      if (!shared) {
        Alert.alert('Backup ready', `Saved to:\n${uri}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Backup failed', 'Could not create the backup file.');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRestore() {
    if (restoreBusy) return;
    setRestoreBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const text = await new File(result.assets[0].uri).text();
      const { deckCount, cardCount } = await importFromText(text);
      load();
      Alert.alert(
        'Restore complete',
        `Added ${deckCount} ${deckCount === 1 ? 'deck' : 'decks'} and ${cardCount} ${
          cardCount === 1 ? 'card' : 'cards'
        }.`
      );
    } catch (e) {
      console.error(e);
      Alert.alert('Restore failed', 'That file is not a valid flashcards backup.');
    } finally {
      setRestoreBusy(false);
    }
  }

  return (
    <Screen style={styles.container}>
      <View style={styles.newRow}>
        <TextInput
          style={styles.input}
          placeholder="New deck name"
          placeholderTextColor={colors.textMuted}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <Button title="Add" onPress={handleCreate} disabled={!newName.trim()} loading={loading} />
      </View>

      <FlatList
        data={decks}
        keyExtractor={(d) => String(d.id)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>No decks yet. Create one above to get started.</Text>
        }
        ListFooterComponent={
          <View style={styles.dataFooter}>
            <Text style={styles.dataLabel}>Data</Text>
            <View style={styles.dataRow}>
              <Button
                title="Back up"
                variant="secondary"
                style={styles.flex1}
                onPress={handleBackup}
                loading={backupBusy}
              />
              <Button
                title="Restore"
                variant="secondary"
                style={styles.flex1}
                onPress={handleRestore}
                loading={restoreBusy}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.deckRow, pressed && styles.pressed]}
            onPress={() => router.push(`/deck/${item.id}`)}
          >
            <View style={styles.deckTextWrap}>
              <Text style={styles.deckName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.deckMeta}>
                {item.total} {item.total === 1 ? 'card' : 'cards'}
              </Text>
            </View>
            <View style={styles.dueBadge}>
              <Text style={styles.dueNumber}>{item.due}</Text>
              <Text style={styles.dueLabel}>due</Text>
            </View>
            {item.due > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.practiceButton, pressed && styles.pressed]}
                onPress={() => router.push(`/deck/${item.id}/practice`)}
                accessibilityRole="button"
                accessibilityLabel={`Practice ${item.name}`}
              >
                <Text style={styles.practiceButtonText}>Practice</Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Bottom padding is owned by <Screen> (safe-area inset); the list adds its
  // own scroll-end breathing room via listContent.
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  newRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  flex1: { flex: 1 },
  dataFooter: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  dataLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  dataRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontSize: 15,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  deckTextWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  deckName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  deckMeta: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  dueBadge: {
    minWidth: 52,
  },
  practiceButton: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  practiceButtonText: {
    color: colors.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  dueNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  dueLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
