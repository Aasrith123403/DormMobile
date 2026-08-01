import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { confirm, notify } from '../../../../src/components/dialog';
import { successFeedback, warningFeedback } from '../../../../src/components/haptics';
import { FadeIn } from '../../../../src/components/motion';
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
import { ChoreFrequency, describeDue, isOverdue } from '../../../../src/core/rotation';
import { todayIso } from '../../../../src/core/subscriptions';
import { useAuth } from '../../../../src/data/auth';
import { GroupChore, useGroup } from '../../../../src/data/groupContext';
import {
  addChore,
  addSupplyItem,
  buySupplyItem,
  completeChore,
  deleteChore,
  deleteSupplyItem,
  markSupplyNeeded,
  setGroupStatus,
} from '../../../../src/data/mutations';
import type { SupplyItemRow } from '../../../../src/lib/database.types';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, radius, spacing, typography } from '../../../../src/theme';

const SUPPLY_SUGGESTIONS = ['Toilet paper', 'Trash bags', 'Paper towels', 'Dish soap', 'Sponges'];
const CHORE_SUGGESTIONS = ['Trash', 'Bathroom', 'Dishes', 'Vacuum', 'Kitchen'];

/** Fixed and small — a status picker, not a chat. */
const STATUSES = [
  { emoji: '😴', label: 'Asleep' },
  { emoji: '📚', label: 'Studying — quiet' },
  { emoji: '👋', label: 'Friends over' },
  { emoji: '🏃', label: 'Out' },
  { emoji: '🟢', label: 'Free' },
];

/** How long a status stays true before it stops being shown. */
const CLEAR_HOURS = 8;

type HouseTab = 'supplies' | 'chores' | 'status';

export default function HouseScreen() {
  const [tab, setTab] = useState<HouseTab>('supplies');
  const { supplyItems, chores, statuses, error, refresh } = useGroup();
  const [refreshing, setRefreshing] = useState(false);

  const neededCount = supplyItems.filter((item) => item.is_needed).length;
  const today = todayIso();
  const overdueCount = chores.filter((c) => isOverdue(c.next_due, today)).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        subtitle={
          neededCount > 0
            ? `${neededCount} ${neededCount === 1 ? 'staple' : 'staples'} needed`
            : overdueCount > 0
              ? `${overdueCount} ${overdueCount === 1 ? 'chore' : 'chores'} overdue`
              : `${statuses.length} ${statuses.length === 1 ? 'status' : 'statuses'} set`
        }
      />

      <View style={styles.tabWrap}>
        <Segmented
          options={[
            { label: 'Supplies', value: 'supplies' },
            { label: 'Chores', value: 'chores' },
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
        {tab === 'supplies' ? <SuppliesPanel /> : tab === 'chores' ? <ChoresPanel /> : <StatusPanel />}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------- supplies -- */

function SuppliesPanel() {
  const { groupId, supplyItems, supplyTurns, refresh } = useGroup();
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  const add = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    try {
      await addSupplyItem({ groupId, name: trimmed });
      setNewItem('');
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not add', message: friendlyError(caught) });
    } finally {
      setAdding(false);
    }
  };

  // Needed things first — that is the whole point of the flag.
  const sorted = [...supplyItems].sort((a, b) => Number(b.is_needed) - Number(a.is_needed));

  return (
    <>
      {supplyItems.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="Nothing tracked yet"
          message="Add a staple. When it runs out, one tap tells the house and names whose turn it is to buy."
        />
      ) : null}

      {sorted.map((item, index) => (
        <FadeIn key={item.id} index={index} distance={6}>
          <SupplyCard item={item} turnUserId={supplyTurns.get(item.id) ?? null} onRefresh={refresh} />
        </FadeIn>
      ))}

      <Card style={styles.addCard}>
        <Text style={styles.cardTitle}>Track a staple</Text>
        <Field
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Toilet paper"
          maxLength={60}
          returnKeyType="done"
          icon="basket-outline"
          onSubmitEditing={() => void add(newItem)}
        />
        <View style={styles.chipRow}>
          {SUPPLY_SUGGESTIONS.map((suggestion) => (
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
          title="Add"
          variant="secondary"
          loading={adding}
          disabled={!newItem.trim()}
          onPress={() => void add(newItem)}
        />
      </Card>
    </>
  );
}

function SupplyCard({
  item,
  turnUserId,
  onRefresh,
}: {
  item: SupplyItemRow;
  turnUserId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const { userId } = useAuth();
  const { memberById, displayName } = useGroup();
  const [amountText, setAmountText] = useState('');
  const [buying, setBuying] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountCents = parseAmountInput(amountText) ?? 0;
  const isMyTurn = turnUserId === userId;
  const turnName = turnUserId ? displayName(turnUserId) : 'Nobody yet';

  const flag = async (needed: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await markSupplyNeeded(item.id, needed);
      if (needed) warningFeedback();
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const buy = async () => {
    if (amountCents <= 0 || busy) return;
    setBusy(true);
    try {
      // One server-side action: logs the expense, clears the flag, advances
      // the rotation.
      await buySupplyItem({ itemId: item.id, amountCents, description: item.name });
      successFeedback();
      setAmountText('');
      setBuying(false);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not log it', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirm({
      title: 'Stop tracking?',
      message: `“${item.name}” will no longer appear here.`,
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
    <Card style={[styles.card, item.is_needed && styles.cardNeeded]}>
      <View style={styles.cardTop}>
        <Avatar name={memberById.get(turnUserId ?? '')?.name ?? '?'} id={turnUserId ?? item.id} size={36} />

        <View style={styles.cardBody}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>
            {item.is_needed ? 'Out — ' : ''}
            {isMyTurn ? 'your turn to buy' : `${turnName}'s turn`}
            {item.last_bought_by ? ` · last: ${displayName(item.last_bought_by)}` : ''}
          </Text>
        </View>

        {item.is_needed ? <Badge label="Needed" tone="warning" /> : null}

        <Pressable onPress={() => void confirmDelete()} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {buying ? (
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
            Splits evenly, clears the flag, and passes the turn on.
          </Text>
        </>
      ) : (
        <View style={styles.actionRow}>
          {item.is_needed ? (
            <Button
              title="Not out after all"
              variant="ghost"
              size="sm"
              onPress={() => void flag(false)}
              style={styles.action}
            />
          ) : (
            <Button
              title="We're out"
              variant="subtle"
              size="sm"
              icon="alert-circle-outline"
              onPress={() => void flag(true)}
              style={styles.action}
            />
          )}
          <Button
            title="Bought it"
            variant={item.is_needed || isMyTurn ? 'primary' : 'secondary'}
            size="sm"
            icon="cart-outline"
            onPress={() => setBuying(true)}
            style={styles.action}
          />
        </View>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- chores -- */

function ChoresPanel() {
  const { groupId, chores, choreTurns, refresh } = useGroup();
  const [newChore, setNewChore] = useState('');
  const [frequency, setFrequency] = useState<ChoreFrequency>('weekly');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const trimmed = newChore.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    try {
      await addChore({ groupId, name: trimmed, frequency });
      setNewChore('');
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not add', message: friendlyError(caught) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      {chores.length === 0 ? (
        <EmptyState
          icon="checkbox-outline"
          title="No chores yet"
          message="Add one and the app answers whose turn it is — nobody maintains a schedule."
        />
      ) : null}

      {chores.map((chore, index) => (
        <FadeIn key={chore.id} index={index} distance={6}>
          <ChoreCard chore={chore} turnUserId={choreTurns.get(chore.id) ?? null} onRefresh={refresh} />
        </FadeIn>
      ))}

      <Card style={styles.addCard}>
        <Text style={styles.cardTitle}>Add a chore</Text>
        <Field
          value={newChore}
          onChangeText={setNewChore}
          placeholder="Trash"
          maxLength={60}
          returnKeyType="done"
          icon="checkbox-outline"
          onSubmitEditing={() => void add()}
        />
        <View style={styles.chipRow}>
          {CHORE_SUGGESTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => setNewChore(suggestion)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
        <Segmented
          options={[
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
            { label: 'Biweekly', value: 'biweekly' },
            { label: 'Monthly', value: 'monthly' },
          ]}
          value={frequency}
          onChange={setFrequency}
        />
        <Button
          title="Add"
          variant="secondary"
          loading={adding}
          disabled={!newChore.trim()}
          onPress={() => void add()}
        />
      </Card>
    </>
  );
}

function ChoreCard({
  chore,
  turnUserId,
  onRefresh,
}: {
  chore: GroupChore;
  turnUserId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const { userId } = useAuth();
  const { memberById, displayName } = useGroup();
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const overdue = isOverdue(chore.next_due, today);
  const isMyTurn = turnUserId === userId;
  const lastDone = chore.completions[0];

  const done = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await completeChore(chore.id);
      successFeedback();
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete chore?',
      message: `“${chore.name}” and its history will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deleteChore(chore.id);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not delete', message: friendlyError(caught) });
    }
  };

  return (
    <Card style={[styles.card, overdue && styles.cardNeeded]}>
      <View style={styles.cardTop}>
        <Avatar name={memberById.get(turnUserId ?? '')?.name ?? '?'} id={turnUserId ?? chore.id} size={36} />

        <View style={styles.cardBody}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {chore.name}
          </Text>
          <Text style={styles.cardMeta}>
            {isMyTurn ? 'Your turn' : `${turnUserId ? displayName(turnUserId) : 'Nobody'}'s turn`} ·{' '}
            {describeDue(chore.next_due, today)}
          </Text>
        </View>

        {overdue ? <Badge label="Overdue" tone="negative" /> : null}

        <Pressable onPress={() => void confirmDelete()} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {lastDone ? (
        <Text style={styles.choreHistory}>
          Last done by {displayName(lastDone.user_id)} ·{' '}
          {new Date(lastDone.completed_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      ) : null}

      <Button
        title="Mark done"
        variant={isMyTurn || overdue ? 'primary' : 'secondary'}
        icon="checkmark"
        loading={busy}
        onPress={done}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- status -- */

function StatusPanel() {
  const { userId } = useAuth();
  const { groupId, members, statuses, refresh } = useGroup();
  const [busy, setBusy] = useState(false);

  const mine = statuses.find((s) => s.user_id === userId);

  const pick = async (label: string) => {
    if (!userId || busy) return;

    setBusy(true);
    try {
      // Tapping the current status again clears it outright.
      await setGroupStatus({
        groupId,
        userId,
        status: label === mine?.status ? 'Free' : label,
        clearsInHours: CLEAR_HOURS,
      });
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
            const active = mine?.status === status.label;
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
        <Text style={styles.buyHint}>Clears itself after {CLEAR_HOURS} hours.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Right now</Text>

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
        Visible to this group only. Nobody is notified when a status changes.
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
  cardNeeded: { borderColor: colors.warning, borderWidth: 1.5 },
  cardTitle: { ...typography.heading },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  cardMeta: { ...typography.caption },
  itemTitle: { ...typography.heading, fontSize: 16 },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },

  buyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  buyField: { flex: 1 },
  buyInput: { fontSize: 20, fontWeight: '700' },
  buyButton: { flex: 1 },
  buyHint: { ...typography.caption, marginTop: -spacing.xs },

  choreHistory: { ...typography.caption, marginTop: -spacing.xs },

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
