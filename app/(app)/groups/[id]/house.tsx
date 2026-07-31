import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { confirm, notify } from '../../../../src/components/dialog';
import { successFeedback } from '../../../../src/components/haptics';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Segmented,
  Tappable,
} from '../../../../src/components/ui';
import { formatMoney, parseAmountInput } from '../../../../src/core/money';
import { nextTurn } from '../../../../src/core/rotation';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import {
  addSupplyItem,
  deleteSupplyItem,
  logSupplyPurchase,
  setGroupStatus,
} from '../../../../src/data/mutations';
import type { SupplyItemRow } from '../../../../src/lib/database.types';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, radius, spacing, typography } from '../../../../src/theme';

const SUGGESTIONS = ['Toilet paper', 'Trash bags', 'Paper towels', 'Dish soap', 'Sponges'];

/** Deliberately small and fixed — a status picker, not a chat. */
const STATUSES = [
  { emoji: '📚', label: 'Studying' },
  { emoji: '😴', label: 'Asleep' },
  { emoji: '👋', label: 'Friends over' },
  { emoji: '🏃', label: 'Out' },
  { emoji: '🎧', label: 'Do not disturb' },
  { emoji: '🍜', label: 'Around' },
];

type HouseTab = 'supplies' | 'status';

/**
 * The two "living together" features share one tab: both are about the house
 * rather than the ledger, and neither is big enough to earn its own slot in
 * the tab bar.
 */
export default function HouseScreen() {
  const [tab, setTab] = useState<HouseTab>('supplies');
  const { supplyItems, statuses, error, refresh } = useGroup();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        subtitle={
          tab === 'supplies'
            ? supplyItems.length > 0
              ? `${supplyItems.length} ${supplyItems.length === 1 ? 'staple' : 'staples'} in rotation`
              : 'Track whose turn it is to buy'
            : `${statuses.length} ${statuses.length === 1 ? 'status' : 'statuses'} set`
        }
      />

      <View style={styles.tabWrap}>
        <Segmented
          options={[
            { label: 'Supplies', value: 'supplies' },
            { label: 'Status', value: 'status' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}
        {tab === 'supplies' ? <SuppliesPanel /> : <StatusPanel />}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------- supplies -- */

function SuppliesPanel() {
  const { userId } = useAuth();
  const { groupId, supplyItems, members, memberById, refresh, displayName } = useGroup();
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  const addItem = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    try {
      // Whoever adds it takes the first turn — they usually just noticed it
      // ran out.
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
    <>
      {supplyItems.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="Nothing in rotation"
          message="Add a shared staple and RoomLedger tracks whose turn it is to buy it."
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
        <Text style={styles.cardTitle}>Add a staple</Text>
        <Field
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Toilet paper"
          maxLength={60}
          returnKeyType="done"
          icon="basket-outline"
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
    </>
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
      await logSupplyPurchase({ itemId: item.id, amountCents, description: item.name });
      successFeedback();
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
          <Text style={styles.itemTitle} numberOfLines={1}>
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
        <>
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
          <Text style={styles.buyHint}>
            Logs a household expense split evenly, then passes the turn on.
          </Text>
        </>
      ) : (
        <Button
          title="I bought this"
          variant={isMyTurn ? 'primary' : 'secondary'}
          icon="cart-outline"
          onPress={() => setExpanded(true)}
        />
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- status -- */

function StatusPanel() {
  const { userId } = useAuth();
  const { groupId, members, statuses, refresh } = useGroup();
  const [busy, setBusy] = useState(false);

  const myStatus = statuses.find((s) => s.user_id === userId)?.status ?? null;

  const pick = async (label: string) => {
    if (!userId || busy) return;

    setBusy(true);
    try {
      // Tapping the current status again resets it to "Around".
      await setGroupStatus({ groupId, userId, status: label === myStatus ? 'Around' : label });
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Set your status</Text>
        <View style={styles.chipGrid}>
          {STATUSES.map((status) => {
            const active = myStatus === status.label;
            return (
              <Tappable
                key={status.label}
                onPress={() => void pick(status.label)}
                disabled={busy}
                style={[styles.statusChip, active && styles.statusChipActive]}
              >
                <Text style={styles.statusEmoji}>{status.emoji}</Text>
                <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>
                  {status.label}
                </Text>
              </Tappable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>The group</Text>

        {members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          members.map((member) => {
            const record = statuses.find((s) => s.user_id === member.id);
            const emoji = STATUSES.find((s) => s.label === record?.status)?.emoji ?? '·';

            return (
              <View key={member.id} style={styles.memberRow}>
                <Avatar name={member.name} id={member.id} size={38} />
                <View style={styles.cardBody}>
                  <Text style={styles.memberName}>
                    {member.id === userId ? 'You' : member.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {record ? `${emoji}  ${record.status}` : 'No status set'}
                  </Text>
                </View>
                {record ? <Text style={styles.timeAgo}>{timeAgo(record.updated_at)}</Text> : null}
              </View>
            );
          })
        )}
      </Card>

      <Text style={styles.footnote}>
        Statuses are visible to this group only, and nobody gets a notification when they change.
      </Text>
    </>
  );
}

function timeAgo(isoTimestamp: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  return `${Math.round(hours / 24)}d`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { gap: spacing.md },
  cardTitle: { ...typography.heading },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  cardMeta: { ...typography.caption },
  itemTitle: { ...typography.heading, fontSize: 16 },

  buyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  buyField: { flex: 1 },
  buyInput: { fontSize: 20, fontWeight: '700' },
  buyButton: { flex: 1 },
  buyHint: { ...typography.caption, marginTop: -spacing.xs },

  addCard: { gap: spacing.md, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.body, fontSize: 14 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statusChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  statusEmoji: { fontSize: 16 },
  statusLabel: { ...typography.body, fontSize: 14 },
  statusLabelActive: { color: colors.primary, fontWeight: '800' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberName: { ...typography.bodyStrong },
  timeAgo: { ...typography.caption, fontSize: 11 },

  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17 },
});
