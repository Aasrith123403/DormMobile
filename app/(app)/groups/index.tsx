import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Loading } from '../../../src/components/ui';
import { formatMoney } from '../../../src/core/money';
import { useAuth } from '../../../src/data/auth';
import { GroupSummary, useGroups } from '../../../src/data/groups';
import { colors, radius, shadow, spacing, typography } from '../../../src/theme';

export default function GroupsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { summaries, totals, loading, error, refresh } = useGroups();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const net = totals.owedToYouCents - totals.youOweCents;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.name}>{profile?.name ?? 'Roommate'}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/profile')}
          accessibilityLabel="Your profile"
          hitSlop={8}
        >
          <Avatar name={profile?.name ?? '?'} id={profile?.id} size={42} />
        </Pressable>
      </View>

      {/* Balances first: the whole point of opening the app. */}
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>
          {net === 0 ? 'All settled up' : net > 0 ? 'You are owed' : 'You owe'}
        </Text>
        <Text
          style={[
            styles.summaryAmount,
            net > 0 && { color: colors.positive },
            net < 0 && { color: colors.negative },
          ]}
        >
          {formatMoney(Math.abs(net))}
        </Text>
        {totals.owedToYouCents > 0 && totals.youOweCents > 0 ? (
          <Text style={styles.summaryDetail}>
            {formatMoney(totals.owedToYouCents)} owed to you · {formatMoney(totals.youOweCents)} owed by
            you
          </Text>
        ) : null}
      </View>

      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {loading && summaries.length === 0 ? (
        <Loading label="Loading your groups" />
      ) : (
        <FlatList
          data={summaries}
          keyExtractor={(item) => item.group.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => <GroupCard summary={item} />}
          ListEmptyComponent={
            <EmptyState
              icon="🏠"
              title="No groups yet"
              message="Create one for your dorm, apartment or next trip — then share the join code."
            />
          }
        />
      )}

      <View style={styles.actions}>
        <Button
          title="New group"
          onPress={() => router.push('/(app)/groups/new')}
          style={styles.action}
        />
        <Button
          title="Join with code"
          variant="secondary"
          onPress={() => router.push('/(app)/groups/join')}
          style={styles.action}
        />
      </View>
    </SafeAreaView>
  );
}

function GroupCard({ summary }: { summary: GroupSummary }) {
  const router = useRouter();
  const { group, memberCount, netCents, role } = summary;

  return (
    <Card style={styles.card} onPress={() => router.push(`/(app)/groups/${group.id}`)}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.cardMeta}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'} · code {group.join_code}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </View>

      <View style={styles.cardBottom}>
        {netCents === 0 ? (
          <Badge label="Settled up" tone="neutral" />
        ) : (
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>{netCents > 0 ? 'You are owed' : 'You owe'}</Text>
            <Text
              style={[
                styles.balanceAmount,
                { color: netCents > 0 ? colors.positive : colors.negative },
              ]}
            >
              {formatMoney(Math.abs(netCents))}
            </Text>
          </View>
        )}
        {role === 'owner' ? <Badge label="Owner" tone="primary" /> : null}
      </View>
    </Card>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerText: { gap: 2 },
  greeting: { ...typography.caption },
  name: { ...typography.title },

  summary: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
    ...shadow,
  },
  summaryLabel: { ...typography.label },
  summaryAmount: { ...typography.display },
  summaryDetail: { ...typography.caption, marginTop: spacing.xs },

  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleBlock: { flex: 1, gap: 2 },
  cardTitle: { ...typography.heading, fontSize: 18 },
  cardMeta: { ...typography.caption },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  balanceLabel: { ...typography.label, color: colors.textMuted },
  balanceAmount: { ...typography.money, fontSize: 18 },

  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  action: { flex: 1 },
});
