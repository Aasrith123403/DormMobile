import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { confirm, notify } from '../../../../src/components/dialog';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner } from '../../../../src/components/ui';
import { formatMoney } from '../../../../src/core/money';
import { describeNextCharge, isDue, todayIso } from '../../../../src/core/subscriptions';
import { GroupSubscription, useGroup } from '../../../../src/data/groupContext';
import { catchUpSubscriptions, deleteSubscription, setSubscriptionActive } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, spacing, typography } from '../../../../src/theme';

export default function SubscriptionsScreen() {
  const router = useRouter();
  const { groupId, subscriptions, memberById, error, refresh, displayName } = useGroup();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = todayIso();

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const runCatchUp = async () => {
    setBusy(true);
    try {
      const created = await catchUpSubscriptions(groupId);
      await refresh();
      await notify({
        title: created > 0 ? 'Charges added' : 'Nothing due',
        message:
          created > 0
            ? `Added ${created} subscription ${created === 1 ? 'charge' : 'charges'} to the ledger.`
            : 'Every subscription is already up to date.',
      });
    } catch (caught) {
      await notify({ title: 'Could not run', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const active = subscriptions.filter((s) => s.active);
  const paused = subscriptions.filter((s) => !s.active);

  const monthlyTotalCents = active.reduce((sum, s) => sum + s.monthlyCostCents, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        subtitle={
          active.length > 0
            ? `${active.length} active · ${formatMoney(monthlyTotalCents)} a month`
            : 'No recurring plans yet'
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        {subscriptions.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title="No shared plans"
            message="Add Netflix, Spotify or the internet bill once — RoomLedger logs the expense every month on its own."
          />
        ) : null}

        {active.map((subscription) => (
          <SubscriptionCard
            key={subscription.id}
            subscription={subscription}
            today={today}
            payerName={displayName(subscription.paid_by)}
            payerRealName={memberById.get(subscription.paid_by)?.name ?? 'Former member'}
            memberNames={subscription.memberIds.map((id) => displayName(id))}
            onRefresh={refresh}
          />
        ))}

        {paused.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Paused</Text>
            {paused.map((subscription) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                today={today}
                payerName={displayName(subscription.paid_by)}
                payerRealName={memberById.get(subscription.paid_by)?.name ?? 'Former member'}
                memberNames={subscription.memberIds.map((id) => displayName(id))}
                onRefresh={refresh}
              />
            ))}
          </>
        ) : null}

        <Button
          title="Add subscription"
          onPress={() => router.push({ pathname: '/(app)/subscription/new', params: { groupId } })}
        />

        {subscriptions.length > 0 ? (
          <Button
            title="Check for due charges"
            variant="ghost"
            loading={busy}
            onPress={runCatchUp}
          />
        ) : null}

        <Text style={styles.footnote}>
          Charges are generated automatically when anyone opens the group, and nightly on the server
          if you enabled the scheduled job.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SubscriptionCard({
  subscription,
  today,
  payerName,
  payerRealName,
  memberNames,
  onRefresh,
}: {
  subscription: GroupSubscription;
  today: string;
  payerName: string;
  payerRealName: string;
  memberNames: string[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const due = subscription.active && isDue(subscription.next_charge_date, today);
  const perPerson =
    subscription.memberIds.length > 0
      ? Math.round(subscription.monthlyCostCents / subscription.memberIds.length)
      : subscription.monthlyCostCents;

  const togglePaused = async () => {
    setBusy(true);
    try {
      await setSubscriptionActive(subscription.id, !subscription.active);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete subscription?',
      message: `“${subscription.name}” stops generating charges. Expenses already logged stay in the ledger.`,
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteSubscription(subscription.id);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not delete', message: friendlyError(caught) });
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {subscription.name}
          </Text>
          <Text style={styles.cardMeta}>
            {payerName} pays · split {subscription.memberIds.length}{' '}
            {subscription.memberIds.length === 1 ? 'way' : 'ways'}
          </Text>
        </View>
        <View style={styles.cardAmounts}>
          <Text style={styles.cardAmount}>{formatMoney(subscription.monthlyCostCents)}</Text>
          <Text style={styles.cardPerMonth}>/month</Text>
        </View>
      </View>

      <View style={styles.chargeRow}>
        <Avatar name={payerRealName} id={subscription.paid_by} size={26} />
        <Text style={styles.chargeText} numberOfLines={1}>
          {memberNames.join(', ') || 'Whole group'}
        </Text>
        <Text style={styles.perPerson}>{formatMoney(perPerson)} each</Text>
      </View>

      <View style={styles.statusRow}>
        {!subscription.active ? (
          <Badge label="Paused" tone="neutral" />
        ) : due ? (
          <Badge label={describeNextCharge(subscription.next_charge_date, today)} tone="warning" />
        ) : (
          <Badge label={describeNextCharge(subscription.next_charge_date, today)} tone="primary" />
        )}

        <View style={styles.cardActions}>
          <Pressable onPress={togglePaused} disabled={busy} hitSlop={6}>
            <Text style={styles.actionLink}>{subscription.active ? 'Pause' : 'Resume'}</Text>
          </Pressable>
          <Pressable onPress={() => void confirmDelete()} hitSlop={6}>
            <Ionicons name="trash-outline" size={16} color={colors.negative} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  sectionTitle: { ...typography.label, marginTop: spacing.sm },

  card: { gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitleBlock: { flex: 1, gap: 2 },
  cardTitle: { ...typography.heading },
  cardMeta: { ...typography.caption },
  cardAmounts: { alignItems: 'flex-end' },
  cardAmount: { ...typography.money, fontSize: 18 },
  cardPerMonth: { ...typography.caption, fontSize: 11 },

  chargeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chargeText: { ...typography.caption, flex: 1 },
  perPerson: { ...typography.caption, fontWeight: '600' },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  actionLink: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17 },
});
