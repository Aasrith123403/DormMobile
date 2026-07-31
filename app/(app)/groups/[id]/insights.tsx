import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { AnimatedBar, AnimatedMoney, FadeIn } from '../../../../src/components/motion';
import {
  Avatar,
  Card,
  EmptyState,
  ErrorBanner,
  IconChip,
  Segmented,
} from '../../../../src/components/ui';
import { formatMoney } from '../../../../src/core/money';
import {
  InsightRange,
  computeInsights,
  filterByRange,
  formatMonth,
} from '../../../../src/core/insights';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import { colors, radius, spacing, typography } from '../../../../src/theme';

/**
 * Where the money actually went. Deliberately separate from Balances: this
 * answers "what did we spend on", not "who owes whom".
 */
export default function InsightsScreen() {
  const { userId } = useAuth();
  const { expenses, members, memberById, error, refresh } = useGroup();

  const [range, setRange] = useState<InsightRange>('month');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const insights = useMemo(() => {
    const rows = expenses.map((expense) => ({
      amountCents: expense.amountCents,
      paidBy: expense.paid_by,
      category: expense.category,
      createdAt: expense.created_at,
      splits: expense.splits,
    }));

    return computeInsights(
      filterByRange(rows, range),
      userId,
      members.map((m) => m.id)
    );
  }, [expenses, range, userId, members]);

  const peakMonth = Math.max(1, ...insights.monthly.map((m) => m.totalCents));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader subtitle="Where the money went" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        <Segmented
          options={[
            { label: 'This month', value: 'month' },
            { label: 'All time', value: 'all' },
          ]}
          value={range}
          onChange={setRange}
        />

        {insights.expenseCount === 0 ? (
          <EmptyState
            icon="stats-chart-outline"
            title={range === 'month' ? 'Nothing yet this month' : 'Nothing logged yet'}
            message={
              'Log a few expenses and this fills in — what you spend most on, ' +
              'who is covering what, and how the months compare.'
            }
          />
        ) : (
          <>
            {/* ------------------------------------------------- totals -- */}
            <View style={styles.statRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statLabel}>Group total</Text>
                <AnimatedMoney cents={insights.totalCents} style={styles.statValue} />
                <Text style={styles.statMeta}>
                  {insights.expenseCount} {insights.expenseCount === 1 ? 'expense' : 'expenses'}
                </Text>
              </Card>

              <Card style={styles.statCard}>
                <Text style={styles.statLabel}>Your share</Text>
                <AnimatedMoney
                  cents={insights.yourShareCents}
                  style={[styles.statValue, { color: colors.primary }]}
                />
                <Text style={styles.statMeta}>avg {formatMoney(insights.averageCents)} each</Text>
              </Card>
            </View>

            {/* --------------------------------------------- categories -- */}
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>By category</Text>
              {insights.byCategory.map((row, index) => (
                <FadeIn key={row.category.id} index={index} distance={6} style={styles.categoryRow}>
                  <IconChip
                    icon={row.category.icon}
                    color={row.category.color}
                    background={row.category.softColor}
                    size={34}
                  />
                  <View style={styles.categoryBody}>
                    <View style={styles.categoryTop}>
                      <Text style={styles.categoryName}>{row.category.label}</Text>
                      <Text style={styles.categoryAmount}>{formatMoney(row.totalCents)}</Text>
                    </View>
                    <AnimatedBar percent={row.percent} color={row.category.color} delay={index * 60} />
                    <Text style={styles.categoryMeta}>
                      {row.percent}% · {row.count} {row.count === 1 ? 'expense' : 'expenses'}
                    </Text>
                  </View>
                </FadeIn>
              ))}
            </Card>

            {/* ------------------------------------------------ members -- */}
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Who spent what</Text>
              <Text style={styles.cardHint}>
                Paid is what went on their card; share is what they consumed.
              </Text>
              {insights.byMember
                .filter((row) => row.paidCents > 0 || row.shareCents > 0)
                .map((row) => {
                  const member = memberById.get(row.userId);
                  return (
                    <View key={row.userId} style={styles.memberRow}>
                      <Avatar name={member?.name ?? 'Former member'} id={row.userId} size={34} />
                      <Text style={styles.memberName} numberOfLines={1}>
                        {row.userId === userId ? 'You' : (member?.name ?? 'Former member')}
                      </Text>
                      <View style={styles.memberAmounts}>
                        <Text style={styles.memberShare}>{formatMoney(row.shareCents)}</Text>
                        <Text style={styles.memberPaid}>paid {formatMoney(row.paidCents)}</Text>
                      </View>
                    </View>
                  );
                })}
            </Card>

            {/* ------------------------------------------------- monthly -- */}
            {insights.monthly.length > 1 ? (
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>Month by month</Text>
                <View style={styles.chart}>
                  {insights.monthly.slice(-6).map((month) => (
                    <View key={month.month} style={styles.barColumn}>
                      <Text style={styles.barValue}>
                        {formatMoney(month.totalCents).replace('.00', '')}
                      </Text>
                      <View
                        style={[
                          styles.bar,
                          { height: Math.max(6, (month.totalCents / peakMonth) * 110) },
                        ]}
                      />
                      <Text style={styles.barLabel}>{formatMonth(month.month).split(' ')[0]}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

            {insights.largest ? (
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>Biggest single expense</Text>
                <View style={styles.largestRow}>
                  <Text style={styles.largestAmount}>
                    {formatMoney(insights.largest.amountCents)}
                  </Text>
                  <Text style={styles.largestMeta}>
                    paid by{' '}
                    {insights.largest.paidBy === userId
                      ? 'you'
                      : (memberById.get(insights.largest.paidBy)?.name ?? 'a former member')}
                  </Text>
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  statRow: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1, gap: 2 },
  statLabel: { ...typography.label },
  statValue: { ...typography.moneyLarge, fontSize: 23 },
  statMeta: { ...typography.caption },

  card: { gap: spacing.md },
  cardTitle: { ...typography.heading },
  cardHint: { ...typography.caption, marginTop: -spacing.sm },

  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryBody: { flex: 1, gap: 5 },
  categoryTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  categoryName: { ...typography.bodyStrong },
  categoryAmount: { ...typography.money, fontSize: 15 },
  categoryMeta: { ...typography.caption, fontSize: 11 },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberName: { ...typography.body, flex: 1 },
  memberAmounts: { alignItems: 'flex-end' },
  memberShare: { ...typography.money, fontSize: 15 },
  memberPaid: { ...typography.caption, fontSize: 11 },

  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  barColumn: { flex: 1, alignItems: 'center', gap: 5 },
  bar: { width: '72%', backgroundColor: colors.primary, borderRadius: radius.sm, minHeight: 6 },
  barValue: { ...typography.caption, fontSize: 10, fontWeight: '700' },
  barLabel: { ...typography.caption, fontSize: 10.5 },

  largestRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  largestAmount: { ...typography.moneyLarge, fontSize: 26 },
  largestMeta: { ...typography.caption },
});
