import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DraggableDeckList, DECK_ROW_HEIGHT } from '@/components/DraggableDeckList';
import { PencilButton } from '@/components/PencilButton';
import { Screen } from '@/components/Screen';
import { createDeck, DeckWithCounts, listDecksWithCounts, reorderDecks } from '@/db/decks';
import { exportAllToFile, importFromText, shareBackup } from '@/lib/backup';
import { colors, deckCoverColor, fonts, radius, shadow, spacing } from '@/theme';

// The composition-notebook marble: white speckles on transparent, painted over
// each deck's color so the cover reads as a marbled notebook in that color.
const NOTEBOOK_SPECKLE = require('../../assets/images/notebook-speckle.png');

// Default height of the Android navigation header's toolbar (excludes the
// status-bar inset, which is added on top). Used to anchor the overflow menu
// just below the header.
const HEADER_TOOLBAR_HEIGHT = 56;

export default function DecksScreen() {
  const router = useRouter();
  // Drop the overflow (⋯) menu just below the header so it opens downward from
  // the button instead of overlapping the status bar. The header height is the
  // status-bar inset plus the default Android toolbar height.
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + HEADER_TOOLBAR_HEIGHT;

  const [decks, setDecks] = useState<DeckWithCounts[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  // Header overflow (⋯) menu holding the backup/restore actions.
  const [menuVisible, setMenuVisible] = useState(false);

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
    <Screen
      style={styles.container}
      title="Decks"
      headerRight={
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          onPress={() => setMenuVisible(true)}
          hitSlop={spacing.sm}
          accessibilityRole="button"
          accessibilityLabel="Data options"
        >
          <Text style={styles.headerButtonIcon}>⋯</Text>
        </Pressable>
      }
    >
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
      </ScrollView>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={[styles.menuBackdrop, { paddingTop: headerHeight + spacing.xs }]}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuCard}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => {
                setMenuVisible(false);
                handleBackup();
              }}
              disabled={backupBusy}
              accessibilityRole="button"
            >
              <Text style={styles.menuItemText}>Back up</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, styles.menuDivider, pressed && styles.pressed]}
              onPress={() => {
                setMenuVisible(false);
                handleRestore();
              }}
              disabled={restoreBusy}
              accessibilityRole="button"
            >
              <Text style={styles.menuItemText}>Restore</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
        <Image
          source={NOTEBOOK_SPECKLE}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          pointerEvents="none"
        />
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
            <Text
              style={[
                styles.dueNumber,
                { color: item.due > 0 ? colors.ferrule : colors.textMuted },
              ]}
            >
              {item.due}
            </Text>
            <Text style={styles.dueLabel}>due</Text>
          </View>
          {item.due > 0 ? (
            <PencilButton
              compact
              style={styles.practicePencil}
              onPress={() => router.push(`/deck/${item.id}/practice`)}
              accessibilityLabel={`Practice ${item.name}`}
            />
          ) : null}
        </View>
      </Pressable>
    );
  }
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
  headerButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  headerButtonIcon: { fontSize: 24, color: colors.chalk, fontWeight: '700', lineHeight: 24 },
  // Overflow (⋯) menu anchored under the header's top-right corner. The top
  // padding (header height) is applied inline so the menu opens downward from
  // the button rather than overlapping the header/status bar.
  menuBackdrop: { flex: 1, alignItems: 'flex-end', paddingRight: spacing.sm },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.text,
    minWidth: 200,
    overflow: 'hidden',
    ...shadow.card,
  },
  menuItem: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  // Hairline separators between items for clearer, higher-contrast rows.
  menuDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  menuItemText: { fontSize: 16, fontFamily: fonts.bodyBold, color: colors.text },
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
  // A small white chip (echoing the cover's subject label) so the due count
  // stays readable on the white-marbled cover instead of washing out.
  dueBadge: {
    minWidth: 52,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    ...shadow.card,
  },
  // The pencil stretches to the column width so every deck's button lines up.
  practicePencil: {
    alignSelf: 'stretch',
  },
  dueNumber: {
    fontSize: 22,
    fontFamily: fonts.bodyExtra,
    textAlign: 'center',
  },
  dueLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
