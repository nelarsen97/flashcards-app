import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import {
  Card,
  deleteCards,
  importCards,
  LEVEL_GROUPS,
  LevelGroup,
  listCards,
  moveCards,
} from '@/db/cards';
import { deleteDeck, DeckWithCounts, getDeck, listDecksWithCounts, renameDeck } from '@/db/decks';
import { parseSemicolonCsv } from '@/lib/csv';
import { applyCardFilters, CardStatus } from '@/lib/search';
import { colors, levelColor, radius, spacing } from '@/theme';

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

  // Live card search: narrows the list as the user types (no submit).
  const [query, setQuery] = useState('');

  // Status (due/learned) and familiarity-group filters that combine with the
  // search query to narrow the visible list. The level menu is a small dropdown.
  const [status, setStatus] = useState<CardStatus>('all');
  const [group, setGroup] = useState<LevelGroup | null>(null);
  const [levelMenuVisible, setLevelMenuVisible] = useState(false);

  // Header overflow (⋯) menu holding the deck-management actions.
  const [menuVisible, setMenuVisible] = useState(false);

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

  // Deck-wide stats above use the full `cards`; only the list below is filtered.
  const visibleCards = applyCardFilters(cards, { query, status, group, now });
  const hasActiveFilter = query.trim() !== '' || status !== 'all' || group !== null;

  // Tapping the active status tile clears it (back to "all"); Total always shows all.
  const toggleStatus = (next: Exclude<CardStatus, 'all'>) =>
    setStatus((s) => (s === next ? 'all' : next));

  function clearFilters() {
    setQuery('');
    setStatus('all');
    setGroup(null);
  }

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

  function confirmDeleteSelected() {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      'Delete cards',
      `Are you sure? You are about to delete ${count} ${count === 1 ? 'card' : 'cards'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCards([...selectedIds]);
            cancelSelecting();
            load();
          },
        },
      ]
    );
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
    <Screen style={styles.container}>
      <Stack.Screen
        options={{
          title: selecting ? 'Select cards' : name || 'Deck',
          headerRight: selecting
            ? undefined
            : () => (
                <Pressable
                  style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                  onPress={() => setMenuVisible(true)}
                  hitSlop={spacing.sm}
                  accessibilityRole="button"
                  accessibilityLabel="Deck options"
                >
                  <Text style={styles.headerButtonIcon}>⋯</Text>
                </Pressable>
              ),
        }}
      />

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

      <FlatList
        data={visibleCards}
        keyExtractor={(c) => String(c.id)}
        numColumns={2}
        columnWrapperStyle={styles.cardColumn}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          hasActiveFilter ? (
            <View style={styles.emptyFilter}>
              <Text style={styles.empty}>No cards match your filters.</Text>
              <Button title="Clear filters" variant="secondary" onPress={clearFilters} />
            </View>
          ) : (
            <Text style={styles.empty}>No cards yet. Add one or import a CSV.</Text>
          )
        }
        renderItem={({ item }) => {
          const isDue = item.due_at <= now;
          const isSelected = selectedIds.has(item.id);
          return (
            <Pressable
              style={({ pressed }) => [styles.cardCell, pressed && styles.pressed]}
              onPress={() =>
                selecting
                  ? toggleSelected(item.id)
                  : router.push(`/deck/${deckId}/card?cardId=${item.id}`)
              }
            >
              <View style={styles.flex1}>
                <Text style={styles.cardFront} numberOfLines={2}>
                  {item.front}
                </Text>
                <Text style={styles.cardBack} numberOfLines={2}>
                  {item.back}
                </Text>
              </View>
              {selecting ? (
                <View style={[styles.cardCellFooter, styles.cardCellFooterEnd]}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                    {isSelected ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                </View>
              ) : (
                <View style={styles.cardCellFooter}>
                  {isDue ? <View style={styles.dueDot} /> : null}
                  <View style={[styles.levelBadge, { backgroundColor: levelColor(item.familiarity) }]}>
                    <Text style={styles.levelText}>Lvl {item.familiarity}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {cards.length > 0 ? (
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={[styles.input, styles.searchInput]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search cards"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                onPress={() => setQuery('')}
                hitSlop={spacing.sm}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Text style={styles.clearIcon}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.levelChip,
              group !== null && styles.levelChipActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setLevelMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter by level"
          >
            <Text style={[styles.levelChipText, group !== null && styles.levelChipTextActive]}>
              {group !== null ? LEVEL_GROUPS.find((g) => g.key === group)?.label : 'Level'}
            </Text>
            <Text style={[styles.levelChipCaret, group !== null && styles.levelChipTextActive]}>▾</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.statsCard}>
        <Stat
          label="Total"
          value={cards.length}
          active={status === 'all'}
          disabled={cards.length === 0}
          onPress={() => setStatus('all')}
        />
        <Stat
          label="Due"
          value={due}
          highlight
          active={status === 'due'}
          disabled={cards.length === 0}
          onPress={() => toggleStatus('due')}
        />
        <Stat
          label="Learned"
          value={learned}
          active={status === 'learned'}
          disabled={cards.length === 0}
          onPress={() => toggleStatus('learned')}
        />
      </View>

      {selecting ? (
        <View style={styles.actions}>
          <Text style={styles.selectionCount}>
            {selectedIds.size} {selectedIds.size === 1 ? 'card' : 'cards'} selected
          </Text>
          <View style={styles.actionRow}>
            <Button
              title={`Delete${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
              variant="danger"
              style={styles.flex1}
              onPress={confirmDeleteSelected}
              disabled={selectedIds.size === 0}
            />
            <Button
              title={`Move${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
              style={styles.flex1}
              onPress={openPicker}
              disabled={selectedIds.size === 0}
            />
          </View>
          <Button title="Cancel" variant="secondary" onPress={cancelSelecting} />
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
              title="Select cards"
              variant="secondary"
              style={styles.flex1}
              onPress={startSelecting}
              disabled={cards.length === 0}
            />
          </View>
        </View>
      )}

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => {
                setMenuVisible(false);
                setDraftName(name);
                setRenaming(true);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.menuItemText}>Rename deck</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => {
                setMenuVisible(false);
                handleImport();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.menuItemText}>Import CSV</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => {
                setMenuVisible(false);
                confirmDelete();
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete deck</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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

      <Modal
        visible={levelMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLevelMenuVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLevelMenuVisible(false)}>
          <View style={styles.levelMenuCard}>
            <LevelOption
              label="All levels"
              active={group === null}
              onPress={() => {
                setGroup(null);
                setLevelMenuVisible(false);
              }}
            />
            {LEVEL_GROUPS.map((g) => (
              <LevelOption
                key={g.key}
                label={g.label}
                color={levelColor(g.min)}
                count={cards.filter((c) => c.familiarity >= g.min && c.familiarity <= g.max).length}
                active={group === g.key}
                onPress={() => {
                  setGroup(g.key);
                  setLevelMenuVisible(false);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function LevelOption({
  label,
  color,
  count,
  active,
  onPress,
}: {
  label: string;
  color?: string;
  count?: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.levelOption,
        active && styles.levelOptionActive,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.levelDot, { backgroundColor: color ?? 'transparent' }]} />
      <Text style={[styles.levelOptionLabel, active && styles.levelOptionLabelActive]}>{label}</Text>
      {count !== undefined ? <Text style={styles.levelOptionCount}>{count}</Text> : null}
    </Pressable>
  );
}

function Stat({
  label,
  value,
  highlight,
  active,
  disabled,
  onPress,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={[styles.stat, active && styles.statActive]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`Filter by ${label}`}
    >
      <Text style={[styles.statValue, highlight && { color: colors.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, active && styles.statLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The bottom inset (so the action buttons clear Android's nav bar) is owned by
  // the <Screen> wrapper. Don't add a paddingBottom here as well: that, stacked
  // with a bottom margin on the actions block, is the padding+margin combo that
  // trips Fabric's hit-rect calc on Android (facebook/react-native#53797).
  container: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  flex1: { flex: 1 },
  headerButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  headerButtonIcon: { fontSize: 24, color: colors.text, fontWeight: '700', lineHeight: 24 },
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInputWrap: { flex: 1, position: 'relative', justifyContent: 'center' },
  // Standalone search box (the shared `input` is sized by its rename row);
  // here it sits in a column, so cancel the flex stretch and give it height.
  // paddingRight leaves room for the overlaid clear button.
  searchInput: {
    flex: 0,
    paddingVertical: spacing.sm,
    paddingRight: spacing.xl,
  },
  clearButton: {
    position: 'absolute',
    right: 0,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  clearIcon: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.sm,
  },
  stat: { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.sm },
  statActive: { backgroundColor: colors.bg },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  statLabelActive: { color: colors.text, fontWeight: '700' },
  actions: { gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  levelChipActive: { borderColor: colors.primary, backgroundColor: colors.bg },
  levelChipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  levelChipTextActive: { color: colors.primary },
  levelChipCaret: { fontSize: 11, color: colors.textMuted },
  list: { flex: 1 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  cardColumn: { gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.lg },
  emptyFilter: { gap: spacing.md, alignItems: 'center' },
  // Two-column grid tile. maxWidth caps a lone trailing card at half width so
  // it lines up with the column above instead of stretching across the row.
  cardCell: {
    flex: 1,
    maxWidth: '50%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  cardFront: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardBack: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  // Pinned to the bottom of the tile (text block above takes the flex space).
  cardCellFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  cardCellFooterEnd: { justifyContent: 'flex-end' },
  dueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  levelBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  levelText: { color: colors.primaryText, fontSize: 12, fontWeight: '700' },
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
  levelMenuCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.xs,
    minWidth: 220,
    alignSelf: 'center',
  },
  // Overflow (⋯) menu anchored under the header's top-right corner.
  menuBackdrop: { flex: 1, alignItems: 'flex-end', paddingTop: spacing.xs, paddingRight: spacing.sm },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    minWidth: 180,
  },
  menuItem: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  menuItemText: { fontSize: 15, color: colors.text },
  menuItemDanger: { color: colors.danger },
  levelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  levelOptionActive: { backgroundColor: colors.bg },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  levelOptionLabel: { flex: 1, fontSize: 15, color: colors.text },
  levelOptionLabelActive: { fontWeight: '700' },
  levelOptionCount: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
