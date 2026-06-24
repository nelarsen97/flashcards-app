import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, importCards, listCards, moveCards } from '@/db/cards';
import { deleteDeck, DeckWithCounts, getDeck, listDecksWithCounts, renameDeck } from '@/db/decks';
import { parseSemicolonCsv } from '@/lib/csv';
import { colors, radius, spacing } from '@/theme';

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const router = useRouter();

  const [name, setName] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  // Captured when cards are (re)loaded, so due/learned counts don't recompute
  // Date.now() during render.
  const [now, setNow] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [importing, setImporting] = useState(false);

  // Selection mode: pick cards to move into another deck.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [otherDecks, setOtherDecks] = useState<DeckWithCounts[]>([]);

  const load = useCallback(() => {
    setNow(Date.now());
    getDeck(deckId).then((d) => setName(d?.name ?? '')).catch(console.error);
    listCards(deckId).then(setCards).catch(console.error);
  }, [deckId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const due = cards.filter((c) => c.due_at <= now).length;
  const learned = cards.length - due;

  async function handleRename() {
    const next = draftName.trim();
    if (!next) return;
    await renameDeck(deckId, next);
    setName(next);
    setRenaming(false);
  }

  function confirmDelete() {
    Alert.alert('Delete deck', `Delete "${name}" and all its cards? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(deckId);
          router.back();
        },
      },
    ]);
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const text = await new File(result.assets[0].uri).text();
      const rows = parseSemicolonCsv(text);
      if (rows.length === 0) {
        Alert.alert('Nothing imported', 'No valid "front;back" lines were found in that file.');
        return;
      }
      const count = await importCards(deckId, rows);
      load();
      Alert.alert('Import complete', `Imported ${count} ${count === 1 ? 'card' : 'cards'}.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Import failed', 'Could not read that file. Make sure it is a text/CSV file.');
    } finally {
      setImporting(false);
    }
  }

  function startSelecting() {
    setSelectedIds(new Set());
    setSelecting(true);
  }

  function cancelSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(cardId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  async function openPicker() {
    if (selectedIds.size === 0) return;
    try {
      const decks = await listDecksWithCounts();
      setOtherDecks(decks.filter((d) => d.id !== deckId));
      setPickerVisible(true);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleMoveTo(target: DeckWithCounts) {
    const ids = [...selectedIds];
    await moveCards(ids, target.id);
    setPickerVisible(false);
    cancelSelecting();
    load();
    Alert.alert(
      'Cards moved',
      `Moved ${ids.length} ${ids.length === 1 ? 'card' : 'cards'} to "${target.name}".`
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: selecting ? 'Select cards' : name || 'Deck' }} />

      {renaming ? (
        <View style={styles.renameRow}>
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            autoFocus
            placeholder="Deck name"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleRename}
          />
          <Button title="Save" onPress={handleRename} disabled={!draftName.trim()} />
          <Button title="Cancel" variant="secondary" onPress={() => setRenaming(false)} />
        </View>
      ) : null}

      <View style={styles.statsCard}>
        <Stat label="Total" value={cards.length} />
        <Stat label="Due" value={due} highlight />
        <Stat label="Learned" value={learned} />
      </View>

      {selecting ? (
        <View style={styles.actions}>
          <Text style={styles.selectionCount}>
            {selectedIds.size} {selectedIds.size === 1 ? 'card' : 'cards'} selected
          </Text>
          <View style={styles.actionRow}>
            <Button title="Cancel" variant="secondary" style={styles.flex1} onPress={cancelSelecting} />
            <Button
              title={`Move${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
              style={styles.flex1}
              onPress={openPicker}
              disabled={selectedIds.size === 0}
            />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            title={due > 0 ? `Practice (${due} due)` : 'Nothing due'}
            onPress={() => router.push(`/deck/${deckId}/practice`)}
            disabled={due === 0}
          />
          <View style={styles.actionRow}>
            <Button
              title="Add card"
              variant="secondary"
              style={styles.flex1}
              onPress={() => router.push(`/deck/${deckId}/card`)}
            />
            <Button
              title="Import CSV"
              variant="secondary"
              style={styles.flex1}
              onPress={handleImport}
              loading={importing}
            />
          </View>
          <Button
            title="Select cards"
            variant="secondary"
            onPress={startSelecting}
            disabled={cards.length === 0}
          />
        </View>
      )}

      <Text style={styles.sectionLabel}>Cards</Text>
      <FlatList
        data={cards}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>No cards yet. Add one or import a CSV.</Text>}
        renderItem={({ item }) => {
          const isDue = item.due_at <= now;
          const isSelected = selectedIds.has(item.id);
          return (
            <Pressable
              style={({ pressed }) => [styles.cardRow, pressed && styles.pressed]}
              onPress={() =>
                selecting
                  ? toggleSelected(item.id)
                  : router.push(`/deck/${deckId}/card?cardId=${item.id}`)
              }
            >
              <View style={styles.flex1}>
                <Text style={styles.cardFront} numberOfLines={1}>
                  {item.front}
                </Text>
                <Text style={styles.cardBack} numberOfLines={1}>
                  {item.back}
                </Text>
              </View>
              {selecting ? (
                <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                  {isSelected ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
              ) : (
                <View style={[styles.statusDot, { backgroundColor: isDue ? colors.fine : colors.easy }]} />
              )}
            </Pressable>
          );
        }}
        ListFooterComponent={
          selecting ? null : (
            <View style={styles.footer}>
              <Button
                title="Rename deck"
                variant="secondary"
                onPress={() => {
                  setDraftName(name);
                  setRenaming(true);
                }}
              />
              <Button title="Delete deck" variant="danger" onPress={confirmDelete} />
            </View>
          )
        }
      />

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Move to deck</Text>
            {otherDecks.length === 0 ? (
              <Text style={styles.modalEmpty}>Create another deck first to move cards into it.</Text>
            ) : (
              <FlatList
                data={otherDecks}
                keyExtractor={(d) => String(d.id)}
                style={styles.modalList}
                contentContainerStyle={styles.modalListContent}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [styles.deckOption, pressed && styles.pressed]}
                    onPress={() => handleMoveTo(item)}
                  >
                    <Text style={styles.deckOptionName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.deckOptionMeta}>
                      {item.total} {item.total === 1 ? 'card' : 'cards'}
                    </Text>
                  </Pressable>
                )}
              />
            )}
            <Button title="Cancel" variant="secondary" onPress={() => setPickerVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && { color: colors.primary }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  flex1: { flex: 1 },
  renameRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  input: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  actions: { gap: spacing.sm, marginBottom: spacing.lg },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm },
  listContent: { gap: spacing.sm, paddingBottom: spacing.xl },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.lg },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  cardFront: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardBack: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: spacing.md },
  footer: { gap: spacing.sm, marginTop: spacing.lg },
  selectionCount: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    marginLeft: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
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
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  modalEmpty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  modalList: { flexGrow: 0 },
  modalListContent: { gap: spacing.sm },
  deckOption: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  deckOptionName: { fontSize: 16, fontWeight: '600', color: colors.text },
  deckOptionMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
