import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { colors, deckCoverColor, fonts, radius, shadow, spacing } from '@/theme';

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
            style={({ pressed }) => [
              styles.cover,
              { backgroundColor: deckCoverColor(item.id) },
              pressed && styles.pressed,
            ]}
            onPress={() => router.push(`/deck/${item.id}`)}
          >
            <Marble seed={item.id} />
            <View style={styles.spine} />
            <View style={styles.label}>
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

// Small deterministic PRNG so a deck's speckle pattern is stable across renders.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The marbled speckle of a composition-notebook cover: light and dark flecks
// scattered across the cover, seeded by deck id so the pattern never shifts.
// Sits behind the spine and label (drawn after it), and never takes touches.
function Marble({ seed }: { seed: number }) {
  const dots = useMemo(() => {
    const rng = mulberry32((Math.abs(seed) * 2654435761) >>> 0 || 1);
    return Array.from({ length: 36 }, () => {
      const size = 1.5 + rng() * 2.5;
      return {
        top: `${rng() * 100}%` as const,
        left: `${rng() * 100}%` as const,
        size,
        light: rng() > 0.5,
      };
    });
  }, [seed]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: d.light ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)',
          }}
        />
      ))}
    </View>
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
    fontFamily: fonts.body,
    color: colors.text,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  flex1: { flex: 1 },
  dataFooter: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  dataLabel: {
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.text,
  },
  dataRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  empty: {
    textAlign: 'center',
    color: colors.text,
    marginTop: spacing.xl,
    fontSize: 16,
    fontFamily: fonts.body,
  },
  // A composition-notebook cover: a marbled colored slab (color per deck) with a
  // dark spine down the left and a white subject label. overflow hides the
  // speckle at the rounded corners.
  cover: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 88,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.lg + spacing.sm, // clear the spine
    overflow: 'hidden',
    ...shadow.card,
  },
  pressed: {
    opacity: 0.7,
  },
  // The black cloth spine running down the binding edge.
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  // The white "subject" label stuck to the cover.
  label: {
    flex: 1,
    marginRight: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  deckName: {
    fontSize: 22,
    fontFamily: fonts.heading,
    color: colors.text,
  },
  deckMeta: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
  dueBadge: {
    minWidth: 52,
  },
  practiceButton: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  practiceButtonText: {
    color: colors.primaryText,
    fontSize: 14,
    fontFamily: fonts.bodyBold,
  },
  // Written straight on the cover, so it's light to read on the marble.
  dueNumber: {
    fontSize: 22,
    fontFamily: fonts.bodyExtra,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dueLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});
