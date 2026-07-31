import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner } from '../../../../src/components/ui';
import { formatMoney } from '../../../../src/core/money';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import { colors, spacing, typography } from '../../../../src/theme';

export default function BalancesScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, balances, transfers, members, settlements, error, refresh, displayName } = useGroup();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const allSettled = transfers.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        {/* Derived on every render from expenses + settlements — never stored. */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Where everyone stands</Text>

          {balances.length === 0 ? (
            <Text style={styles.muted}>No members yet.</Text>
          ) : (
            balances.map((balance) => {
              const member = members.find((m) => m.id === balance.userId);
              const isMe = balance.userId === userId;

              return (
                <View key={balance.userId} style={styles.balanceRow}>
                  <Avatar name={member?.name ?? 'Former member'} id={balance.userId} size={36} />

                  <View style={styles.balanceBody}>
                    <Text style={styles.balanceName} numberOfLines={1}>
                      {isMe ? 'You' : (member?.name ?? 'Former member')}
                    </Text>
                    <Text style={styles.balanceMeta}>
                      paid {formatMoney(balance.paidCents)} · share {formatMoney(balance.owedCents)}
                    </Text>
                  </View>

                  {balance.netCents === 0 ? (
                    <Badge label="Even" tone="neutral" />
                  ) : (
                    <View style={styles.balanceAmountBlock}>
                      <Text
                        style={[
                          styles.balanceAmount,
                          { color: balance.netCents > 0 ? colors.positive : colors.negative },
                        ]}
                      >
                        {formatMoney(Math.abs(balance.netCents))}
                      </Text>
                      <Text style={styles.balanceDirection}>
                        {balance.netCents > 0 ? 'is owed' : 'owes'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>

        {/* The minimum set of payments that clears every balance at once. */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Simplest way to settle</Text>

          {allSettled ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Everyone is square"
              message="No payments needed right now."
            />
          ) : (
            <>
              {transfers.map((transfer) => (
                <View
                  key={`${transfer.fromUser}-${transfer.toUser}-${transfer.amountCents}`}
                  style={styles.transferRow}
                >
                  <Text style={styles.transferText}>
                    <Text style={styles.transferName}>{displayName(transfer.fromUser)}</Text>
                    {' → '}
                    <Text style={styles.transferName}>{displayName(transfer.toUser)}</Text>
                  </Text>
                  <Text style={styles.transferAmount}>{formatMoney(transfer.amountCents)}</Text>
                </View>
              ))}

              <Text style={styles.explainer}>
                {transfers.length} {transfers.length === 1 ? 'payment' : 'payments'} clears all{' '}
                {balances.filter((b) => b.netCents !== 0).length} outstanding balances.
              </Text>

              <Button
                title="Settle up"
                onPress={() => router.push({ pathname: '/(app)/settle', params: { groupId } })}
              />
            </>
          )}
        </Card>

        {settlements.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Recent settlements</Text>
            {settlements.slice(0, 8).map((settlement) => (
              <View key={settlement.id} style={styles.settlementRow}>
                <Text style={styles.settlementText} numberOfLines={1}>
                  {displayName(settlement.from_user)} paid {displayName(settlement.to_user)}
                </Text>
                <Text style={styles.settlementMeta}>
                  {formatMoney(Math.round(Number(settlement.amount) * 100))} ·{' '}
                  {new Date(settlement.settled_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { gap: spacing.md },
  cardTitle: { ...typography.heading },
  muted: { ...typography.body, color: colors.textMuted },

  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  balanceBody: { flex: 1, gap: 2 },
  balanceName: { ...typography.body, fontWeight: '600' },
  balanceMeta: { ...typography.caption },
  balanceAmountBlock: { alignItems: 'flex-end' },
  balanceAmount: { ...typography.money },
  balanceDirection: { ...typography.caption, fontSize: 11 },

  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  transferText: { ...typography.body, flex: 1 },
  transferName: { fontWeight: '600' },
  transferAmount: { ...typography.money },
  explainer: { ...typography.caption, lineHeight: 17 },

  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  settlementText: { ...typography.body, flex: 1 },
  settlementMeta: { ...typography.caption },
});
