import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { DraggableDeckList, DECK_ROW_HEIGHT } from '@/components/DraggableDeckList';
import { Screen } from '@/components/Screen';
import { createDeck, DeckWithCounts, listDecksWithCounts, reorderDecks } from '@/db/decks';
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

  // Apply a drag-reordered deck list: reflect it locally right away, then
  // persist the new order so it survives the next app start.
  function handleReorder(orderedIds: number[]) {
    setDecks((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]));
      return orderedIds.map((id) => byId.get(id)).filter((d): d is DeckWithCounts => d != null);
    });
    reorderDecks(orderedIds).catch(console.error);
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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {decks.length === 0 ? (
          <Text style={styles.empty}>No decks yet. Create one above to get started.</Text>
        ) : (
          <DraggableDeckList decks={decks} onReorder={handleReorder} renderItem={renderDeck} />
        )}

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
      </ScrollView>
    </Screen>
  );

  // A single composition-notebook cover. Long-pressing it lifts the row for
  // drag-reordering (handled by DraggableDeckList); a tap opens the deck.
  function renderDeck(item: DeckWithCounts) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.cover,
          { backgroundColor: deckCoverColor(item.id) },
          pressed && styles.pressed,
        ]}
        onPress={() => router.push(`/deck/${item.id}`)}
      >
        <Marble />
        <View style={styles.spine} />
        <View style={styles.label}>
          <View style={styles.labelLine}>
            <Text style={styles.deckName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <View style={styles.labelLine}>
            <Text style={styles.deckMeta}>
              {item.total} {item.total === 1 ? 'card' : 'cards'}
            </Text>
          </View>
        </View>
        <View style={styles.rightCol}>
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
        </View>
      </Pressable>
    );
  }
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

// One fixed marble pattern, generated once and shared by every cover — just
// like real composition books, which all carry the same marbling in different
// colors. The cover tints it by showing its base color through the gaps. Dense
// light + dark flecks read as marble; sits behind the spine/label and takes no
// touches.
const MARBLE = (() => {
  const rng = mulberry32(0x5bd1e995);
  return Array.from({ length: 130 }, () => {
    const size = 1 + rng() * 3;
    return {
      top: `${rng() * 100}%` as const,
      left: `${rng() * 100}%` as const,
      size,
      // Mostly dark flecks with occasional white ones, like marbled cloth.
      color: rng() > 0.62 ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
    };
  });
})();

function Marble() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {MARBLE.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: d.color,
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
    color: colors.chalk,
  },
  dataRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  empty: {
    textAlign: 'center',
    color: colors.chalk,
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
    height: DECK_ROW_HEIGHT,
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
  // The black cloth spine running down the binding edge — solid, no marble
  // showing through.
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: spacing.md,
    backgroundColor: '#141414',
  },
  // The white "subject" label stuck to the cover — runs long across the cover.
  label: {
    flex: 1,
    marginRight: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  // Each label field sits on its own ruled writing line.
  labelLine: {
    borderBottomWidth: 1,
    borderBottomColor: colors.paperLine,
    paddingBottom: 3,
  },
  deckName: {
    fontSize: 22,
    fontFamily: fonts.heading,
    color: colors.text,
  },
  deckMeta: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
  // Fixed width so the label is always the same size, whether or not a deck has
  // a Practice button (no due cards → no button).
  rightCol: {
    width: 104,
    alignItems: 'center',
    gap: spacing.sm,
  },
  dueBadge: {
    minWidth: 52,
  },
  practiceButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  practiceButtonText: {
    color: colors.primaryText,
    fontSize: 14,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
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
