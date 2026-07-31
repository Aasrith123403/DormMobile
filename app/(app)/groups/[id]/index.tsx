import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { confirm, notify } from '../../../../src/components/dialog';
import { FadeIn } from '../../../../src/components/motion';
import { successFeedback } from '../../../../src/components/haptics';
import {
  Avatar,
  AvatarStack,
  Badge,
  EmptyState,
  ErrorBanner,
  Field,
  IconChip,
  Loading,
  Tappable,
} from '../../../../src/components/ui';
import { getCategory } from '../../../../src/core/categories';
import { suggestTemplates } from '../../../../src/core/insights';
import { formatMoney } from '../../../../src/core/money';
import { evenSplit } from '../../../../src/core/splits';
import { useAuth } from '../../../../src/data/auth';
import { LedgerExpense, useGroup } from '../../../../src/data/groupContext';
import { addExpense, deleteExpense } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, radius, shadowLifted, spacing, typography } from '../../../../src/theme';

export default function LedgerScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, expenses, members, loading, error, refresh, displayName, memberById } = useGroup();

  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return expenses;

    return expenses.filter((expense) => {
      const payer = memberById.get(expense.paid_by)?.name ?? '';
      const category = getCategory(expense.category).label;
      return (
        expense.description.toLowerCase().includes(needle) ||
        payer.toLowerCase().includes(needle) ||
        category.toLowerCase().includes(needle)
      );
    });
  }, [expenses, query, memberById]);

  const sections = useMemo(() => groupByDay(filtered), [filtered]);

  /** Things this group logs often, offered as one-tap repeats. */
  const templates = useMemo(
    () =>
      suggestTemplates(
        expenses.map((expense) => ({
          description: expense.description,
          amountCents: expense.amountCents,
          category: expense.category,
          createdAt: expense.created_at,
        })),
        4
      ),
    [expenses]
  );

  /**
   * One tap: you paid, split evenly across everyone, same amount as last
   * time. Anything unusual goes through the full form instead.
   */
  const quickAdd = async (template: (typeof templates)[number]) => {
    if (!userId || quickBusy) return;

    setQuickBusy(template.description);
    try {
      await addExpense({
        groupId,
        paidBy: userId,
        createdBy: userId,
        description: template.description,
        amountCents: template.amountCents,
        category: template.category,
        splits: evenSplit(
          template.amountCents,
          members.map((m) => m.id)
        ),
      });
      successFeedback();
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not add', message: friendlyError(caught) });
    } finally {
      setQuickBusy(null);
    }
  };

  const confirmDelete = async (expense: LedgerExpense) => {
    const confirmed = await confirm({
      title: 'Delete expense?',
      message: `“${expense.description}” will be removed for everyone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteExpense(expense.id);
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not delete', message: friendlyError(caught) });
    }
  };

  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((expense) => {
        const date = new Date(expense.created_at);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      })
      .reduce((sum, expense) => sum + expense.amountCents, 0);
  }, [expenses]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        action={
          <Pressable
            onPress={() => {
              setSearchOpen((open) => !open);
              if (searchOpen) setQuery('');
            }}
            hitSlop={8}
            accessibilityLabel="Search expenses"
          >
            <Ionicons
              name={searchOpen ? 'close' : 'search'}
              size={21}
              color={searchOpen ? colors.text : colors.textMuted}
            />
          </Pressable>
        }
      />

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, person or category"
            icon="search"
            autoFocus
            autoCorrect={false}
          />
        </View>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {loading && expenses.length === 0 ? (
        <Loading label="Loading the ledger" />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {members.length === 1 && !query ? (
                <FadeIn>
                  <Tappable
                    onPress={() => router.push({ pathname: '/(app)/group-info', params: { groupId } })}
                    style={styles.nudge}
                  >
                    <Ionicons name="person-add" size={18} color={colors.primary} />
                    <View style={styles.nudgeBody}>
                      <Text style={styles.nudgeTitle}>You are the only one here</Text>
                      <Text style={styles.nudgeText}>
                        Share the join code so roommates see this ledger too.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                  </Tappable>
                </FadeIn>
              ) : null}

              {monthTotal > 0 && !query ? (
                <View style={styles.monthRow}>
                  <Text style={styles.monthLabel}>This month</Text>
                  <Text style={styles.monthTotal}>{formatMoney(monthTotal)}</Text>
                </View>
              ) : null}

              {templates.length > 0 && !query ? (
                <View style={styles.quickBlock}>
                  <Text style={styles.quickLabel}>Log again</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickRow}
                  >
                    {templates.map((template) => {
                      const category = getCategory(template.category);
                      const busy = quickBusy === template.description;

                      return (
                        <Tappable
                          key={template.description}
                          onPress={() => void quickAdd(template)}
                          disabled={Boolean(quickBusy)}
                          style={[styles.quickChip, busy && styles.quickChipBusy]}
                        >
                          <Ionicons name={category.icon as never} size={15} color={category.color} />
                          <View>
                            <Text style={styles.quickChipTitle} numberOfLines={1}>
                              {template.description}
                            </Text>
                            <Text style={styles.quickChipAmount}>
                              {formatMoney(template.amountCents)}
                            </Text>
                          </View>
                        </Tappable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </>
          }
          renderItem={({ item, index }) =>
            item.type === 'header' ? (
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayHeader}>{item.label}</Text>
                <Text style={styles.dayTotal}>{formatMoney(item.totalCents)}</Text>
              </View>
            ) : (
              <FadeIn index={index} distance={8}>
                <ExpenseRow
                  expense={item.expense}
                mine={item.expense.paid_by === userId}
                payerName={displayName(item.expense.paid_by)}
                payerAvatarName={memberById.get(item.expense.paid_by)?.name ?? 'Former member'}
                participants={item.expense.splits
                  .map((split) => memberById.get(split.userId))
                  .filter(Boolean)
                  .map((member) => ({ id: member!.id, name: member!.name }))}
                yourShareCents={
                  item.expense.splits.find((split) => split.userId === userId)?.shareCents ?? null
                }
                  onLongPress={() => void confirmDelete(item.expense)}
                />
              </FadeIn>
            )
          }
          ListEmptyComponent={
            query ? (
              <EmptyState icon="search" title="No matches" message={`Nothing found for “${query}”.`} />
            ) : (
              <EmptyState
                icon="receipt-outline"
                title="Nothing logged yet"
                message={
                  'Tap Add expense, type the amount, pick a category — that is it. ' +
                  'Everyone is included and the split is even unless you change it.'
                }
              />
            )
          }
        />
      )}

      <Tappable
        accessibilityLabel="Add expense"
        onPress={() => router.push({ pathname: '/(app)/expense/new', params: { groupId } })}
        style={[styles.fab, shadowLifted]}
      >
        <Ionicons name="add" size={24} color={colors.textInverse} />
        <Text style={styles.fabLabel}>Add expense</Text>
      </Tappable>
    </SafeAreaView>
  );
}

function ExpenseRow({
  expense,
  mine,
  payerName,
  payerAvatarName,
  participants,
  yourShareCents,
  onLongPress,
}: {
  expense: LedgerExpense;
  mine: boolean;
  payerName: string;
  payerAvatarName: string;
  participants: { id: string; name: string }[];
  yourShareCents: number | null;
  onLongPress: () => void;
}) {
  const category = getCategory(expense.category);

  return (
    <Tappable onLongPress={onLongPress} haptic={false} scaleTo={0.99} style={styles.row}>
      <IconChip icon={category.icon} color={category.color} background={category.softColor} />

      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {expense.description}
          </Text>
          {expense.subscription_id ? <Badge label="Auto" tone="primary" /> : null}
          {expense.receipt_url ? (
            <Ionicons name="image-outline" size={13} color={colors.textFaint} />
          ) : null}
        </View>

        <View style={styles.rowMetaLine}>
          <Avatar name={payerAvatarName} id={expense.paid_by} size={16} />
          <Text style={styles.rowMeta} numberOfLines={1}>
            {mine ? 'You paid' : `${payerName} paid`}
          </Text>
          <AvatarStack people={participants} size={16} max={3} />
        </View>
      </View>

      <View style={styles.rowAmounts}>
        <Text style={styles.rowAmount}>{formatMoney(expense.amountCents)}</Text>
        {yourShareCents !== null ? (
          <Text style={styles.rowShare}>you {formatMoney(yourShareCents)}</Text>
        ) : (
          <Text style={styles.rowShare}>not yours</Text>
        )}
      </View>
    </Tappable>
  );
}

/* ---------------------------------------------------------------------- */

type Section =
  | { type: 'header'; key: string; label: string; totalCents: number }
  | { type: 'expense'; key: string; expense: LedgerExpense };

/** Flattens into day-grouped rows, each header carrying that day's total. */
function groupByDay(expenses: LedgerExpense[]): Section[] {
  const sections: Section[] = [];
  const dayTotals = new Map<string, number>();

  for (const expense of expenses) {
    const day = expense.created_at.slice(0, 10);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + expense.amountCents);
  }

  let currentDay: string | null = null;

  for (const expense of expenses) {
    const day = expense.created_at.slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      sections.push({
        type: 'header',
        key: `day-${day}`,
        label: formatDayLabel(expense.created_at),
        totalCents: dayTotals.get(day) ?? 0,
      });
    }
    sections.push({ type: 'expense', key: expense.id, expense });
  }

  return sections;
}

function formatDayLabel(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },

  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  nudgeBody: { flex: 1, gap: 2 },
  nudgeTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.primary },
  nudgeText: { ...typography.caption, color: colors.primary, opacity: 0.85, lineHeight: 16 },
  list: { padding: spacing.lg, paddingTop: 0, paddingBottom: 130, gap: spacing.sm },

  monthRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthLabel: { ...typography.label },
  monthTotal: { ...typography.money, fontSize: 17 },

  quickBlock: { gap: spacing.xs, marginBottom: spacing.sm },
  quickLabel: { ...typography.label },
  quickRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 190,
  },
  quickChipBusy: { opacity: 0.5 },
  quickChipTitle: { ...typography.caption, color: colors.text, fontWeight: '700' },
  quickChipAmount: { ...typography.money, fontSize: 13 },

  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dayHeader: { ...typography.label },
  dayTotal: { ...typography.caption, fontWeight: '700' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { ...typography.bodyStrong, flexShrink: 1 },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMeta: { ...typography.caption },
  rowAmounts: { alignItems: 'flex-end', gap: 2 },
  rowAmount: { ...typography.money },
  rowShare: { ...typography.caption, fontSize: 11 },

  fab: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  fabLabel: { color: colors.textInverse, fontSize: 16, fontWeight: '700' },
});
