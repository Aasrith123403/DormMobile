import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GettingStarted, useOnboardingDismissed } from '../../../src/components/GettingStarted';
import { AnimatedMoney, FadeIn } from '../../../src/components/motion';
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  GradientCard,
  Loading,
  Tappable,
} from '../../../src/components/ui';
import { formatMoney } from '../../../src/core/money';
import { useAuth } from '../../../src/data/auth';
import { GroupSummary, useGroups } from '../../../src/data/groups';
import { colors, gradients, radius, spacing, typography } from '../../../src/theme';

export default function GroupsScreen() {
  const router = useRouter();
  const { profile, userId } = useAuth();
  const { summaries, totals, expenseCount, loading, error, refresh } = useGroups();
  const [refreshing, setRefreshing] = React.useState(false);
  const { dismissed, dismiss } = useOnboardingDismissed(userId);

  // Everything the checklist needs, derived from data already on screen.
  const onboardingFacts = React.useMemo(
    () => ({
      hasGroup: summaries.length > 0,
      hasCoMember: summaries.some((s) => s.memberCount > 1),
      hasVenmo: Boolean(profile?.venmo_username),
      hasExpense: expenseCount > 0,
    }),
    [summaries, profile?.venmo_username, expenseCount]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const net = totals.owedToYouCents - totals.youOweCents;
  const heroGradient =
    net === 0 ? gradients.brand : net > 0 ? gradients.positive : gradients.negative;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={summaries}
        keyExtractor={(item) => item.group.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View>
                <Text style={styles.greeting}>{greeting()}</Text>
                <Text style={styles.name}>{profile?.name ?? 'Roommate'}</Text>
              </View>
              <Pressable
                onPress={() => router.push('/(app)/profile')}
                accessibilityLabel="Your profile"
                hitSlop={8}
              >
                <Avatar name={profile?.name ?? '?'} id={profile?.id} size={44} />
              </Pressable>
            </View>

            {/* Balances first: the whole point of opening the app. */}
            <GradientCard colors={heroGradient} style={styles.hero}>
              <Text style={styles.heroLabel}>
                {net === 0 ? 'ALL SETTLED UP' : net > 0 ? 'YOU ARE OWED' : 'YOU OWE'}
              </Text>
              <AnimatedMoney cents={Math.abs(net)} style={styles.heroAmount} />

              {totals.owedToYouCents > 0 && totals.youOweCents > 0 ? (
                <View style={styles.heroSplit}>
                  <View style={styles.heroSplitItem}>
                    <Ionicons name="arrow-down" size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.heroSplitText}>
                      {formatMoney(totals.owedToYouCents)} in
                    </Text>
                  </View>
                  <View style={styles.heroSplitItem}>
                    <Ionicons name="arrow-up" size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.heroSplitText}>{formatMoney(totals.youOweCents)} out</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.heroHint}>
                  {net === 0
                    ? 'Nothing outstanding across your groups.'
                    : `Across ${summaries.length} ${summaries.length === 1 ? 'group' : 'groups'}.`}
                </Text>
              )}
            </GradientCard>

            <View style={styles.quickActions}>
              <Tappable
                onPress={() => router.push('/(app)/groups/new')}
                style={styles.quickAction}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="add" size={20} color={colors.primary} />
                </View>
                <Text style={styles.quickText}>New group</Text>
              </Tappable>

              <Tappable
                onPress={() => router.push('/(app)/groups/join')}
                style={styles.quickAction}
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.positiveSoft }]}>
                  <Ionicons name="enter-outline" size={20} color={colors.positive} />
                </View>
                <Text style={styles.quickText}>Join with code</Text>
              </Tappable>
            </View>

            {dismissed !== null && !loading ? (
              <GettingStarted
                facts={onboardingFacts}
                dismissed={dismissed}
                onDismiss={() => void dismiss()}
              />
            ) : null}

            {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

            {summaries.length > 0 ? <Text style={styles.sectionLabel}>Your groups</Text> : null}

            {loading && summaries.length === 0 ? <Loading label="Loading your groups" /> : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <FadeIn index={index}>
            <GroupCard summary={item} />
          </FadeIn>
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="home-outline"
              title="No groups yet"
              message="Create one for your dorm, apartment or next trip — then share the join code."
              action={<Button title="Create a group" onPress={() => router.push('/(app)/groups/new')} />}
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function GroupCard({ summary }: { summary: GroupSummary }) {
  const router = useRouter();
  const { group, memberCount, netCents, role, members } = summary;

  return (
    <Card style={styles.card} onPress={() => router.push(`/(app)/groups/${group.id}`)}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.cardMeta}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'} · {group.join_code}
          </Text>
        </View>
        {members.length > 0 ? <AvatarStack people={members} size={28} max={4} /> : null}
      </View>

      <View style={styles.cardBottom}>
        {netCents === 0 ? (
          <Badge label="Settled up" tone="positive" icon="checkmark-circle" />
        ) : (
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>{netCents > 0 ? 'You are owed' : 'You owe'}</Text>
            <AnimatedMoney
              cents={Math.abs(netCents)}
              style={[styles.balanceAmount, { color: netCents > 0 ? colors.positive : colors.negative }]}
            />
          </View>
        )}

        <View style={styles.cardRight}>
          {role === 'owner' ? <Badge label="Owner" tone="primary" /> : null}
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </View>
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  header: { gap: spacing.lg, marginBottom: spacing.xs },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { ...typography.caption },
  name: { ...typography.title, fontSize: 25 },

  hero: { gap: 2 },
  heroLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.82)',
  },
  heroAmount: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.2,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  heroHint: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  heroSplit: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  heroSplitItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroSplitText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.92)' },

  quickActions: { flexDirection: 'row', gap: spacing.md },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  quickIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickText: { ...typography.bodyStrong, fontSize: 14, flexShrink: 1 },

  sectionLabel: { ...typography.label },

  card: { gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleBlock: { flex: 1, gap: 2 },
  cardTitle: { ...typography.heading, fontSize: 18 },
  cardMeta: { ...typography.caption },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  balanceLabel: { ...typography.caption },
  balanceAmount: { ...typography.money, fontSize: 18 },
});
