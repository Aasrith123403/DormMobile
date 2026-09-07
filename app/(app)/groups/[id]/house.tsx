import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoresPanel } from '../../../../src/components/ChoresPanel';
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
import { describeChoreLoad } from '../../../../src/core/chores';
import { PLACES, STATUSES, getPlace, statusEmoji } from '../../../../src/core/presence';
import { isOverdue } from '../../../../src/core/rotation';
import { todayIso } from '../../../../src/core/subscriptions';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import {
  addSupplyItem,
  buySupplyItem,
  deleteSupplyItem,
  markSupplyNeeded,
  sendPing,
  setGroupStatus,
} from '../../../../src/data/mutations';
import type { SupplyItemRow } from '../../../../src/lib/database.types';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, fonts, radius, spacing, typography } from '../../../../src/theme';

const SUPPLY_SUGGESTIONS = ['Toilet paper', 'Trash bags', 'Paper towels', 'Dish soap', 'Sponges'];

const CLEAR_HOURS = 8;

type HouseTab = 'supplies' | 'chores' | 'status';

export default function HouseScreen() {
  const { tab: requested } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<HouseTab>(
    requested === 'chores' || requested === 'status' ? requested : 'supplies'
  );
  const { supplyItems, chores, statuses, error, refresh } = useGroup();
  const [refreshing, setRefreshing] = useState(false);
  const neededCount = supplyItems.filter((item) => item.is_needed).length;
  const today = todayIso();
  const overdueCount = chores.filter((c) => isOverdue(c.next_due, today)).length;
  const choreLoad = describeChoreLoad(
    chores.map((c) => ({
      id: c.id,
      name: c.name,
      nextDue: c.next_due,
      assignedTo: c.assigned_to,
      ownerId: c.assigned_to,
    })),
    today
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        title="The house"
        subtitle={
          neededCount > 0
            ? `${neededCount} ${neededCount === 1 ? 'staple' : 'staples'} needed`
            : overdueCount > 0
              ? `${overdueCount} ${overdueCount === 1 ? 'chore' : 'chores'} overdue`
              : tab === 'chores'
                ? choreLoad
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

  const sorted = [...supplyItems].sort((a, b) => Number(b.is_needed) - Number(a.is_needed));
  const tracked = new Set(supplyItems.map((item) => item.name.toLowerCase()));
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
        {/* One tap each: these add straight away rather than filling the box. */}
        <View style={styles.chipRow}>
          {SUPPLY_SUGGESTIONS.filter((s) => !tracked.has(s.toLowerCase())).map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => void add(suggestion)}
              disabled={adding}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Ionicons name="add" size={13} color={colors.textMuted} />
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
      <Pressable
        onLongPress={() => void confirmDelete()}
        delayLongPress={450}
        accessibilityLabel={`${item.name}. Long press to stop tracking.`}
        style={styles.cardTop}
      >
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

        {item.is_needed ? (
          <Tappable
            onPress={() => void flag(false)}
            disabled={busy}
            accessibilityLabel="Not out after all"
          >
            <Badge label="Needed ✕" tone="warning" />
          </Tappable>
        ) : null}
      </Pressable>

      {buying ? (
        <>
          <View style={styles.buyRow}>
            <Field
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"

              onSubmitEditing={() => void buy()}
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
          {!item.is_needed ? (
            <Button
              title="We're out"
              variant="subtle"
              size="sm"
              icon="alert-circle-outline"
              onPress={() => void flag(true)}
              style={styles.action}
            />
          ) : null}
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

function StatusPanel() {
  const { userId } = useAuth();
  const { groupId, members, statuses, refresh } = useGroup();
  const [busy, setBusy] = useState(false);
  const [pinging, setPinging] = useState<string | null>(null);
  const mine = statuses.find((s) => s.user_id === userId);
  const save = async (next: { status?: string; place?: string | null }) => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await setGroupStatus({
        groupId,
        userId,
        status: next.status ?? mine?.status ?? 'Free',
        place: next.place !== undefined ? next.place : (mine?.place ?? null),
        clearsInHours: CLEAR_HOURS,
      });
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const pick = (label: string) => save({ status: label === mine?.status ? 'Free' : label });
  const pickPlace = (id: string) => save({ place: id === mine?.place ? null : id });
  const ping = async (toUser: string | null) => {
    if (!userId || pinging) return;
    setPinging(toUser ?? 'all');
    try {
      await sendPing({ groupId, toUser });
      successFeedback();
      await refresh();
      await notify({
        title: 'Sent',
        message: toUser ? 'They will see it when they open the app.' : 'Everyone will see it.',
      });
    } catch (caught) {
      await notify({ title: 'Could not send', message: friendlyError(caught) });
    } finally {
      setPinging(null);
    }
  };

  return (
    <>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>You right now</Text>

        <View style={styles.chipGrid}>
          {STATUSES.map((status) => {
            const active = mine?.status === status.id;
            return (
              <Tappable
                key={status.id}
                onPress={() => void pick(status.id)}
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

        <View style={styles.chipGrid}>
          {PLACES.map((place) => {
            const active = mine?.place === place.id;
            return (
              <Tappable
                key={place.id}
                onPress={() => void pickPlace(place.id)}
                disabled={busy}
                style={[styles.statusChip, active && styles.statusChipActive]}
              >
                <Ionicons
                  name={place.icon as never}
                  size={15}
                  color={active ? colors.primary : colors.textFaint}
                />
                <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>
                  {place.label}
                </Text>
              </Tappable>
            );
          })}
        </View>

        <Text style={styles.buyHint}>
          Tap again to clear. Clears itself after {CLEAR_HOURS} hours. The place is self-reported —
          the app never reads your location.
        </Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.rosterHead}>
          <Text style={styles.cardTitle}>The house</Text>
          <Button
            title="Come here"
            variant="secondary"
            size="sm"
            icon="people-outline"
            loading={pinging === 'all'}
            onPress={() => void ping(null)}
          />
        </View>

        {members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          members.map((member) => {
            const record = statuses.find((s) => s.user_id === member.id);
            const emoji = statusEmoji(record?.status);
            const place = getPlace(record?.place);
            return (
              <View key={member.id} style={styles.memberRow}>
                <Avatar name={member.name} id={member.id} size={38} />
                <View style={styles.cardBody}>
                  <Text style={styles.memberName}>
                    {member.id === userId ? 'You' : member.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {record ? `${emoji}  ${record.status}` : 'No status set'}
                    {place ? ` · ${place.label.toLowerCase()}` : ''}
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
  cardNeeded: { borderColor: colors.primary, borderWidth: 2 },
  cardTitle: { ...typography.heading },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  cardMeta: { ...typography.caption },
  itemTitle: { ...typography.heading, fontSize: 16 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  buyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  buyField: { flex: 1 },
  buyInput: { fontSize: 20, fontFamily: fonts.bold },
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
  statusLabelActive: { color: colors.primary, fontFamily: fonts.bold },
  rosterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberName: { ...typography.bodyStrong },
  timeAgo: { ...typography.caption, fontSize: 11 },
  pingButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },

  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17 },
});
