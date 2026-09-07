import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlowOrb, Squiggle } from '../../../../src/components/shapes';
import { describeChoreLoad } from '../../../../src/core/chores';
import { formatMoney } from '../../../../src/core/money';
import { isOverdue } from '../../../../src/core/rotation';
import { todayIso } from '../../../../src/core/subscriptions';
import { useGroup } from '../../../../src/data/groupContext';
import { useHouseFeed } from '../../../../src/data/useHouseFeed';
import { colors, fonts, gradients, radius, spacing, typography } from '../../../../src/theme';

interface Destination {
  key: string;
  title: string;
  stat: string;
  icon: string;
  tone: keyof typeof gradients;
  route: string;
}

export default function ExploreScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const {
    groupId,
    expenses,
    supplyItems,
    chores,
    statuses,
    subscriptions,
    events,
    members,
    transfers,
    refresh,
  } = useGroup();
  const { thisMonth } = useHouseFeed();
  const [refreshing, setRefreshing] = useState(false);
  const today = todayIso();
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const trend = useMemo(() => {
    const days = 14;
    const buckets = new Array(days).fill(0);
    const start = Date.now() - (days - 1) * 86_400_000;
    for (const expense of expenses) {
      const at = Date.parse(expense.created_at);
      if (Number.isNaN(at) || at < start) continue;
      const index = Math.min(days - 1, Math.floor((at - start) / 86_400_000));
      buckets[index] += expense.amountCents;
    }

    return buckets;
  }, [expenses]);

  const hasTrend = trend.some((value) => value > 0);
  const neededCount = supplyItems.filter((item) => item.is_needed).length;
  const overdueChores = chores.filter((c) => isOverdue(c.next_due, today)).length;
  const upcomingEvents = events.filter((e) => e.event_date >= today).length;
  const destinations: Destination[] = [
    {
      key: 'ledger',
      title: 'Ledger',
      stat: expenses.length === 0 ? 'Nothing yet' : `${expenses.length} logged`,
      icon: 'receipt',
      tone: 'brand',
      route: `/(app)/groups/${groupId}/ledger`,
    },
    {
      key: 'balances',
      title: 'Balances',
      stat:
        transfers.length === 0
          ? 'All settled'
          : `${transfers.length} ${transfers.length === 1 ? 'payment' : 'payments'} to make`,
      icon: 'swap-horizontal',
      tone: transfers.length === 0 ? 'positive' : 'sunset',
      route: `/(app)/groups/${groupId}/balances`,
    },
    {
      key: 'chores',
      title: 'Chores',
      stat: describeChoreLoad(
        chores.map((c) => ({
          id: c.id,
          name: c.name,
          nextDue: c.next_due,
          assignedTo: c.assigned_to,
          ownerId: c.assigned_to,
        })),
        today
      ),
      icon: 'clipboard',
      tone: overdueChores > 0 ? 'negative' : 'brand',
      route: `/(app)/groups/${groupId}/house?tab=chores`,
    },
    {
      key: 'supplies',
      title: 'Supplies',
      stat: neededCount > 0 ? `${neededCount} needed` : 'Nothing out',
      icon: 'basket',
      tone: neededCount > 0 ? 'sunset' : 'positive',
      route: `/(app)/groups/${groupId}/house?tab=supplies`,
    },
    {
      key: 'calendar',
      title: 'Calendar',
      stat: upcomingEvents > 0 ? `${upcomingEvents} coming up` : 'Nothing planned',
      icon: 'calendar',
      tone: 'violet',
      route: `/(app)/groups/${groupId}/calendar`,
    },
    {
      key: 'status',
      title: "Who's about",
      stat: statuses.length > 0 ? `${statuses.length} shared` : 'Nobody said',
      icon: 'people',
      tone: 'calm',
      route: `/(app)/groups/${groupId}/house?tab=status`,
    },
    {
      key: 'subs',
      title: 'Recurring',
      stat: `${subscriptions.filter((s) => s.active).length} active`,
      icon: 'repeat',
      tone: 'violet',
      route: `/(app)/groups/${groupId}/subscriptions`,
    },
    {
      key: 'insights',
      title: 'Insights',
      stat: 'Where it goes',
      icon: 'stats-chart',
      tone: 'calm',
      route: `/(app)/groups/${groupId}/insights`,
    },
    {
      key: 'people',
      title: 'Housemates',
      stat: `${members.length} ${members.length === 1 ? 'person' : 'people'}`,
      icon: 'person-add',
      tone: 'brand',
      route: `/(app)/group-info?groupId=${groupId}`,
    },
  ];

  const categories = thisMonth.byCategory.slice(0, 3);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <GlowOrb size={320} tone="brand" opacity={0.38} style={styles.glowRight} />

        <Text style={styles.pageTitle}>Explore</Text>

        <View style={styles.chartCard}>
          <View style={styles.chartHead}>
            <View>
              <Text style={styles.chartLabel}>The house spent</Text>
              <Text style={styles.chartValue}>{formatMoney(thisMonth.totalCents)}</Text>
            </View>
            <View style={styles.periodChip}>
              <Text style={styles.periodText}>This month</Text>
            </View>
          </View>

          {hasTrend ? (
            <Squiggle
              values={trend}
              width={Math.max(220, width - spacing.xl * 2 - spacing.lg * 2)}
              height={110}
              tone="brand"
            />
          ) : (
            <Text style={styles.chartEmpty}>
              Nothing logged in the last two weeks — the line shows up once there is.
            </Text>
          )}
        </View>

        {categories.length > 0 ? (
          <View style={styles.statGrid}>
            <LinearGradient
              colors={[gradients.brand[0], gradients.brand[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.statTile, styles.statTileLarge]}
            >
              <Text style={styles.statBig}>{categories[0].count}</Text>
              <Text style={styles.statCaptionOn}>{categories[0].category.label}</Text>
            </LinearGradient>

            <View style={styles.statColumn}>
              {categories.slice(1).map((row) => (
                <View key={row.category.id} style={[styles.statTile, styles.statTileSmall]}>
                  <View style={styles.statSmallRow}>
                    <Text style={styles.statNumber}>{row.count}</Text>
                    <Ionicons
                      name={row.category.icon as never}
                      size={17}
                      color={colors.textMuted}
                    />
                  </View>
                  <Text style={styles.statCaption}>{row.category.label}</Text>
                </View>
              ))}
              {categories.length === 1 ? (
                <View style={[styles.statTile, styles.statTileSmall]}>
                  <Text style={styles.statNumber}>—</Text>
                  <Text style={styles.statCaption}>Nothing else yet</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>Everything else</Text>

        <View style={styles.listCard}>
          {destinations.map((destination, index) => (
            <Pressable
              key={destination.key}
              onPress={() => router.push(destination.route as never)}
              accessibilityRole="button"
              accessibilityLabel={destination.title}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivided,
                pressed && styles.rowPressed,
              ]}
            >
              <LinearGradient
                colors={[gradients[destination.tone][0], gradients[destination.tone][1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.rowIcon}
              >
                <Ionicons name={destination.icon as never} size={17} color="#FFFFFF" />
              </LinearGradient>

              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{destination.title}</Text>
                <Text style={styles.rowStat} numberOfLines={1}>
                  {destination.stat}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  glowRight: { position: 'absolute', top: -180, right: -130 },
  pageTitle: { ...typography.hero, marginTop: spacing.sm, marginBottom: spacing.lg },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  chartHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  chartLabel: { ...typography.caption, fontSize: 12 },
  chartValue: {
    fontFamily: fonts.bold,
    fontSize: 28,
    letterSpacing: -0.8,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  periodText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  chartEmpty: { ...typography.caption, paddingVertical: spacing.xl, textAlign: 'center' },
  statGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  statTile: { borderRadius: radius.lg, padding: spacing.lg, overflow: 'hidden' },
  statTileLarge: { flex: 1, minHeight: 152, justifyContent: 'flex-end' },
  statColumn: { flex: 1, gap: spacing.md },
  statTileSmall: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', gap: 2 },
  statSmallRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statBig: { fontFamily: fonts.bold, fontSize: 44, lineHeight: 50, color: '#FFFFFF' },
  statNumber: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  statCaption: { ...typography.label, fontSize: 10 },
  statCaptionOn: { ...typography.label, fontSize: 10, color: 'rgba(255,255,255,0.9)' },
  section: { ...typography.title, marginTop: spacing.xl, marginBottom: spacing.md },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowPressed: { opacity: 0.6 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15.5, color: colors.text },
  rowStat: { ...typography.caption, fontSize: 12 },
});
