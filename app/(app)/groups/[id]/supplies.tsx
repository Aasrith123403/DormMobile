import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { confirm, notify } from '../../../../src/components/dialog';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Field } from '../../../../src/components/ui';
import { formatMoney, parseAmountInput } from '../../../../src/core/money';
import { nextTurn } from '../../../../src/core/rotation';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import { addSupplyItem, deleteSupplyItem, logSupplyPurchase } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import type { SupplyItemRow } from '../../../../src/lib/database.types';
import { colors, radius, spacing, typography } from '../../../../src/theme';

const SUGGESTIONS = ['Toilet paper', 'Trash bags', 'Paper towels', 'Dish soap', 'Sponges'];

export default function SuppliesScreen() {
  const { userId } = useAuth();
  const { groupId, supplyItems, members, memberById, error, refresh, displayName } = useGroup();

  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const addItem = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    try {
      // The person adding the item takes the first turn — they are usually
      // the one who just noticed it ran out.
      await addSupplyItem({ groupId, name: trimmed, firstTurnUserId: userId });
      setNewItem('');
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not add', message: friendlyError(caught) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        subtitle={
          supplyItems.length > 0
            ? `${supplyItems.length} shared ${supplyItems.length === 1 ? 'staple' : 'staples'} in rotation`
            : 'Track whose turn it is to buy'
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        {supplyItems.length === 0 ? (
          <EmptyState
            icon="🧻"
            title="Nothing in rotation"
            message="Add a shared staple and RoomLedger keeps track of whose turn it is to buy it."
          />
        ) : null}

        {supplyItems.map((item) => (
          <SupplyCard
            key={item.id}
            item={item}
            isMyTurn={item.current_turn_user_id === userId}
            turnName={displayName(item.current_turn_user_id)}
            turnRealName={
              item.current_turn_user_id
                ? (memberById.get(item.current_turn_user_id)?.name ?? 'Former member')
                : '?'
            }
            nextUpName={displayName(
              nextTurn(
                members.map((m) => m.id),
                item.current_turn_user_id
              )
            )}
            onRefresh={refresh}
          />
        ))}

        <Card style={styles.addCard}>
          <Text style={styles.addTitle}>Add a staple</Text>
          <Field
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Toilet paper"
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={() => void addItem(newItem)}
          />
          <View style={styles.chipRow}>
            {SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => setNewItem(suggestion)}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text style={styles.chipText}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>
          <Button
            title="Add to rotation"
            variant="secondary"
            loading={adding}
            disabled={!newItem.trim()}
            onPress={() => void addItem(newItem)}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function SupplyCard({
  item,
  isMyTurn,
  turnName,
  turnRealName,
  nextUpName,
  onRefresh,
}: {
  item: SupplyItemRow;
  isMyTurn: boolean;
  turnName: string;
  turnRealName: string;
  nextUpName: string;
  onRefresh: () => Promise<void>;
}) {
  const [amountText, setAmountText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountCents = parseAmountInput(amountText) ?? 0;

  const buy = async () => {
    if (amountCents <= 0 || busy) return;

    setBusy(true);
    try {
      // Server-side: logs the expense, splits it, and advances the turn.
      await logSupplyPurchase({ itemId: item.id, amountCents, description: `${item.name}` });
      setAmountText('');
      setExpanded(false);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not log it', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirm({
      title: 'Remove from rotation?',
      message: `“${item.name}” will no longer be tracked.`,
      confirmLabel: 'Remove',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteSupplyItem(item.id);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not remove', message: friendlyError(caught) });
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Avatar name={turnRealName} id={item.current_turn_user_id ?? item.id} size={38} />

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>
            {isMyTurn ? 'Your turn to buy' : `${turnName}'s turn`} · then {nextUpName}
          </Text>
        </View>

        {isMyTurn ? <Badge label="Your turn" tone="warning" /> : null}

        <Pressable onPress={() => void confirmDelete()} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.buyRow}>
          <Field
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0.00"
            keyboardType="decimal-pad"
            autoFocus
            style={styles.buyField}
            inputStyle={styles.buyInput}
          />
          <Button
            title={amountCents > 0 ? `Log ${formatMoney(amountCents)}` : 'Log'}
            onPress={buy}
            loading={busy}
            disabled={amountCents <= 0}
            style={styles.buyButton}
          />
        </View>
      ) : (
        <Button
          title="I bought this"
          variant={isMyTurn ? 'primary' : 'secondary'}
          onPress={() => setExpanded(true)}
        />
      )}

      {expanded ? (
        <Text style={styles.buyHint}>
          Logs a group expense split evenly, then passes the turn on.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { ...typography.heading },
  cardMeta: { ...typography.caption },

  buyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  buyField: { flex: 1 },
  buyInput: { fontSize: 20, fontWeight: '700' },
  buyButton: { flex: 1 },
  buyHint: { ...typography.caption },

  addCard: { gap: spacing.md, marginTop: spacing.sm },
  addTitle: { ...typography.heading },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.body, fontSize: 14 },
});
