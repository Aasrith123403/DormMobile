import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirm, notify } from '../../../../src/components/dialog';
import { Avatar, Badge, EmptyState, ErrorBanner, Loading } from '../../../../src/components/ui';
import { GroupHeader } from '../../../../src/components/GroupHeader';
import { formatMoney } from '../../../../src/core/money';
import { useAuth } from '../../../../src/data/auth';
import { LedgerExpense, useGroup } from '../../../../src/data/groupContext';
import { deleteExpense } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, radius, shadow, spacing, typography } from '../../../../src/theme';

export default function LedgerScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, expenses, loading, error, refresh, displayName, memberById } = useGroup();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const sections = useMemo(() => groupByDay(expenses), [expenses]);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader />

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {loading && expenses.length === 0 ? (
        <Loading label="Loading the ledger" />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <Text style={styles.dayHeader}>{item.label}</Text>
            ) : (
              <ExpenseRow
                expense={item.expense}
                mine={item.expense.paid_by === userId}
                payerName={displayName(item.expense.paid_by)}
                payerAvatarName={memberById.get(item.expense.paid_by)?.name ?? 'Former member'}
                yourShareCents={
                  item.expense.splits.find((split) => split.userId === userId)?.shareCents ?? null
                }
                onLongPress={() => void confirmDelete(item.expense)}
              />
            )
          }
          ListEmptyComponent={
            <EmptyState
              icon="🧾"
              title="Nothing logged yet"
              message="Add the first shared expense — groceries, pizza, the router bill."
            />
          }
        />
      )}

      {/* Logging an expense is the app's hot path: one tap from anywhere. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={() => router.push({ pathname: '/(app)/expense/new', params: { groupId } })}
        style={({ pressed }) => [styles.fab, shadow, pressed && styles.fabPressed]}
      >
        <Ionicons name="add" size={26} color={colors.textInverse} />
        <Text style={styles.fabLabel}>Add expense</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function ExpenseRow({
  expense,
  mine,
  payerName,
  payerAvatarName,
  yourShareCents,
  onLongPress,
}: {
  expense: LedgerExpense;
  mine: boolean;
  payerName: string;
  payerAvatarName: string;
  yourShareCents: number | null;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Avatar name={payerAvatarName} id={expense.paid_by} size={40} />

      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {expense.description}
          </Text>
          {expense.subscription_id ? <Badge label="Auto" tone="primary" /> : null}
          {expense.receipt_url ? (
            <Ionicons name="image-outline" size={14} color={colors.textFaint} />
          ) : null}
        </View>

        <Text style={styles.rowMeta}>
          {mine ? 'You paid' : `${payerName} paid`} · split {expense.splits.length}{' '}
          {expense.splits.length === 1 ? 'way' : 'ways'}
        </Text>
      </View>

      <View style={styles.rowAmounts}>
        <Text style={styles.rowAmount}>{formatMoney(expense.amountCents)}</Text>
        {yourShareCents !== null ? (
          <Text style={styles.rowShare}>your share {formatMoney(yourShareCents)}</Text>
        ) : (
          <Text style={styles.rowShare}>not your split</Text>
        )}
      </View>
    </Pressable>
  );
}

/* ---------------------------------------------------------------------- */

type Section =
  | { type: 'header'; key: string; label: string }
  | { type: 'expense'; key: string; expense: LedgerExpense };

/** Flattens the expense list into day-grouped rows for a single FlatList. */
function groupByDay(expenses: LedgerExpense[]): Section[] {
  const sections: Section[] = [];
  let currentDay: string | null = null;

  for (const expense of expenses) {
    const day = expense.created_at.slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      sections.push({ type: 'header', key: `day-${day}`, label: formatDayLabel(expense.created_at) });
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
  list: { padding: spacing.lg, paddingBottom: 120, gap: spacing.sm },

  dayHeader: {
    ...typography.caption,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },

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
  rowPressed: { opacity: 0.7 },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { ...typography.body, fontWeight: '600', flexShrink: 1 },
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
  fabPressed: { backgroundColor: colors.primaryDark },
  fabLabel: { color: colors.textInverse, fontSize: 16, fontWeight: '600' },
});
