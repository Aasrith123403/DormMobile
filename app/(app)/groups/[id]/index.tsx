import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { notify } from '../../../../src/components/dialog';
import { successFeedback } from '../../../../src/components/haptics';
import { FadeIn } from '../../../../src/components/motion';
import { SettlePromptCard } from '../../../../src/components/SettlePromptCard';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  IconChip,
  Loading,
  Tappable,
} from '../../../../src/components/ui';
import { FeedEntry, buildFeed, feedTimeAgo } from '../../../../src/core/feed';
import { formatMoney } from '../../../../src/core/money';
import { currentMonthKey, previousMonthKey, summarizeMonth } from '../../../../src/core/spendSummary';
import { todayIso } from '../../../../src/core/subscriptions';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import { completeChore, markSupplyNeeded } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, radius, shadowLifted, spacing, typography } from '../../../../src/theme';

/**
 * The house feed — the group's landing screen.
 *
 * Nobody posts here. Every row is a byproduct of something that already
 * happened, or a date the app already holds. The screen's only job is to make
 * opening the app worth it without anyone having to maintain anything.
 */
export default function HouseFeedScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const {
    groupId,
    expenses,
    supplyItems,
    chores,
    statuses,
    settlements,
    subscriptions,
    supplyTurns,
    choreTurns,
    members,
    memberById,
    displayName,
    loading,
    error,
    refresh,
  } = useGroup();

  const [refreshing, setRefreshing] = useState(false);
  const today = todayIso();

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const thisMonth = useMemo(
    () =>
      summarizeMonth(
        expenses.map((e) => ({
          amountCents: e.amountCents,
          paidBy: e.paid_by,
          category: e.category,
          createdAt: e.created_at,
          splits: e.splits,
          payers: e.payers,
        })),
        currentMonthKey(),
        members.map((m) => m.id)
      ),
    [expenses, members]
  );

  const lastMonth = useMemo(() => {
    const summary = summarizeMonth(
      expenses.map((e) => ({
        amountCents: e.amountCents,
        paidBy: e.paid_by,
        category: e.category,
        createdAt: e.created_at,
        splits: e.splits,
        payers: e.payers,
      })),
      previousMonthKey(currentMonthKey()),
      members.map((m) => m.id)
    );
    return summary.isEmpty ? null : summary;
  }, [expenses, members]);

  const feed = useMemo(
    () =>
      buildFeed({
        viewerId: userId,
        nameOf: displayName,
        expenses: expenses.map((e) => ({
          id: e.id,
          description: e.description,
          amountCents: e.amountCents,
          paidBy: e.paid_by,
          createdAt: e.created_at,
          supplyItemId: e.supply_item_id,
          repeatParentId: e.repeat_parent_id,
        })),
        supplyItems: supplyItems.map((item) => ({
          id: item.id,
          name: item.name,
          isNeeded: item.is_needed,
          neededAt: item.needed_at,
          neededBy: item.needed_by,
          turnUserId: supplyTurns.get(item.id) ?? null,
        })),
        chores: chores.map((chore) => ({
          id: chore.id,
          name: chore.name,
          nextDue: chore.next_due,
          turnUserId: choreTurns.get(chore.id) ?? null,
          completions: chore.completions.map((c) => ({
            id: c.id,
            userId: c.user_id,
            completedAt: c.completed_at,
          })),
        })),
        statuses: statuses.map((s) => ({
          userId: s.user_id,
          status: s.status,
          updatedAt: s.updated_at,
        })),
        settlements: settlements.map((s) => ({
          id: s.id,
          fromUser: s.from_user,
          toUser: s.to_user,
          amountCents: Math.round(Number(s.amount) * 100),
          settledAt: s.settled_at,
        })),
        // Recurring money that has not posted yet: subscriptions plus any
        // expense the user marked "repeats monthly".
        upcoming: [
          ...subscriptions
            .filter((s) => s.active)
            .map((s) => ({
              id: `sub-${s.id}`,
              name: s.name,
              amountCents: s.monthlyCostCents,
              dueDate: s.next_charge_date,
            })),
          ...expenses
            .filter((e) => e.repeat_interval && e.repeat_next_date)
            .map((e) => ({
              id: `rep-${e.id}`,
              name: e.description,
              amountCents: e.amountCents,
              dueDate: e.repeat_next_date!,
            })),
        ],
        lastMonth: lastMonth
          ? {
              month: lastMonth.month,
              label: lastMonth.label,
              totalCents: lastMonth.totalCents,
              byCategory: lastMonth.byCategory,
            }
          : null,
        today,
      }),
    [
      userId,
      displayName,
      expenses,
      supplyItems,
      chores,
      statuses,
      settlements,
      subscriptions,
      supplyTurns,
      choreTurns,
      lastMonth,
      today,
    ]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader subtitle={thisMonth.isEmpty ? undefined : `${formatMoney(thisMonth.totalCents)} this month`} />

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {loading && feed.length === 0 ? (
        <Loading label="Catching up" />
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.header}>
              <SettlePromptCard />

              {!thisMonth.isEmpty ? (
                <Tappable
                  onPress={() => router.push(`/(app)/groups/${groupId}/insights`)}
                  style={styles.glance}
                >
                  <IconChip icon="stats-chart" color={colors.primary} background={colors.primarySoft} size={34} />
                  <View style={styles.glanceBody}>
                    <Text style={styles.glanceTitle}>
                      {formatMoney(thisMonth.totalCents)} this month
                    </Text>
                    <Text style={styles.glanceMeta}>
                      {thisMonth.expenseCount}{' '}
                      {thisMonth.expenseCount === 1 ? 'expense' : 'expenses'}
                      {thisMonth.byCategory[0]
                        ? ` · mostly ${thisMonth.byCategory[0].category.label.toLowerCase()}`
                        : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
                </Tappable>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index} distance={6}>
              <FeedRow
                entry={item}
                avatarName={item.actorId ? (memberById.get(item.actorId)?.name ?? '?') : '?'}
                onRefresh={refresh}
              />
            </FadeIn>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="home-outline"
              title="Nothing has happened yet"
              message="Log an expense, add a staple or a chore — this fills itself in from what everyone does."
              action={
                <Button
                  title="Add an expense"
                  onPress={() => router.push({ pathname: '/(app)/expense/new', params: { groupId } })}
                />
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function FeedRow({
  entry,
  avatarName,
  onRefresh,
}: {
  entry: FeedEntry;
  avatarName: string;
  onRefresh: () => Promise<void>;
}) {
  const { supplyItems, chores } = useGroup();
  const [busy, setBusy] = useState(false);

  /**
   * The one-tap resolution for an actionable row, done inline so the feed is
   * a place things get finished rather than a list of places to navigate to.
   */
  const act = async () => {
    if (busy) return;
    setBusy(true);

    try {
      if (entry.kind === 'supply-needed') {
        const item = supplyItems.find((s) => `supply-needed-${s.id}` === entry.id);
        if (item) {
          // Un-flag only; buying takes an amount, which lives on the House tab.
          await markSupplyNeeded(item.id, false);
        }
      } else if (entry.id.startsWith('chore-due-')) {
        const chore = chores.find((c) => `chore-due-${c.id}` === entry.id);
        if (chore) await completeChore(chore.id);
      }

      successFeedback();
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const isChore = entry.id.startsWith('chore-due-');

  return (
    <View style={[styles.row, entry.actionable && styles.rowActionable]}>
      {entry.actorId ? (
        <Avatar name={avatarName} id={entry.actorId} size={34} />
      ) : (
        <IconChip
          icon={entry.icon}
          color={entry.actionable ? colors.warning : colors.textMuted}
          background={entry.actionable ? colors.warningSoft : colors.surfaceAlt}
          size={34}
        />
      )}

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        {entry.detail ? <Text style={styles.rowDetail}>{entry.detail}</Text> : null}

        {entry.actionable ? (
          <Button
            title={isChore ? 'Mark done' : 'Got it'}
            variant="subtle"
            size="sm"
            loading={busy}
            onPress={act}
            style={styles.rowAction}
          />
        ) : null}
      </View>

      <View style={styles.rowRight}>
        {entry.amountCents !== null ? (
          <Text style={styles.rowAmount}>{formatMoney(entry.amountCents)}</Text>
        ) : null}
        {!entry.actionable ? <Text style={styles.rowTime}>{feedTimeAgo(entry.at)}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },

  glance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  glanceBody: { flex: 1, gap: 2 },
  glanceTitle: { ...typography.bodyStrong },
  glanceMeta: { ...typography.caption },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowActionable: { borderColor: colors.warning, borderWidth: 1.5 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { ...typography.body, lineHeight: 20 },
  rowDetail: { ...typography.caption },
  rowAction: { alignSelf: 'flex-start', marginTop: spacing.xs },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowAmount: { ...typography.money, fontSize: 14 },
  rowTime: { ...typography.caption, fontSize: 11 },
});
