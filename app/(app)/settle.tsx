import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirm, notify } from '../../src/components/dialog';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Loading } from '../../src/components/ui';
import { Transfer } from '../../src/core/balances';
import { formatMoney } from '../../src/core/money';
import { useAuth } from '../../src/data/auth';
import { GroupProvider, useGroup } from '../../src/data/groupContext';
import { recordSettlement } from '../../src/data/mutations';
import { friendlyError } from '../../src/lib/supabase';
import { buildVenmoLinks, settleUpNote, VenmoLinkError } from '../../src/venmo/deepLink';
import { colors, spacing, typography } from '../../src/theme';

export default function SettleRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  if (!groupId) return <ErrorBanner message="Missing group." />;

  return (
    <GroupProvider groupId={groupId}>
      <SettleScreen />
    </GroupProvider>
  );
}

interface PendingPayment {
  transfer: Transfer;
  recipientName: string;
}

function SettleScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { group, groupId, transfers, memberById, displayName, loading, refresh } = useGroup();

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Venmo takes over the screen; when the user comes back we ask whether the
  // payment went through and only then write the settlement row.
  const pendingRef = useRef<PendingPayment | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;

      void confirm({
        title: 'Did the payment go through?',
        message: `Record ${formatMoney(pending.transfer.amountCents)} paid to ${pending.recipientName}?`,
        confirmLabel: 'Yes, record it',
        cancelLabel: 'Not yet',
      }).then((confirmed) => {
        if (confirmed) void commitSettlement(pending.transfer);
      });
    });

    return () => subscription.remove();
    // commitSettlement is stable enough for this listener's lifetime; the
    // values it closes over come from context and are re-read on each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, group?.name]);

  const commitSettlement = async (transfer: Transfer) => {
    const key = transferKey(transfer);
    setBusyKey(key);
    setError(null);

    try {
      await recordSettlement({
        groupId,
        fromUser: transfer.fromUser,
        toUser: transfer.toUser,
        amountCents: transfer.amountCents,
        note: group?.name ? `Settle up · ${group.name}` : null,
      });
      await refresh();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusyKey(null);
    }
  };

  const payWithVenmo = async (transfer: Transfer) => {
    const recipient = memberById.get(transfer.toUser);
    const handle = recipient?.venmo_username ?? '';

    if (!handle) {
      void notify({
        title: 'No Venmo username',
        message: `${recipient?.name ?? 'They'} hasn't added a Venmo username yet. Ask them to add it in their profile, or record the payment by hand.`,
      });
      return;
    }

    try {
      const { appUrl, webUrl } = buildVenmoLinks({
        recipient: handle,
        amountCents: transfer.amountCents,
        note: settleUpNote(group?.name ?? 'RoomLedger'),
      });

      pendingRef.current = { transfer, recipientName: recipient?.name ?? 'them' };

      // Prefer the installed app, but only where a custom scheme means
      // anything: react-native-web's canOpenURL always resolves true, so on
      // web the venmo:// link would open a dead tab instead of the site.
      const canOpenApp =
        Platform.OS !== 'web' && (await Linking.canOpenURL(appUrl).catch(() => false));
      await Linking.openURL(canOpenApp ? appUrl : webUrl);
    } catch (caught) {
      pendingRef.current = null;
      setError(
        caught instanceof VenmoLinkError ? caught.message : friendlyError(caught)
      );
    }
  };

  /**
   * Move-out settle: records every outstanding transfer at once. The set is
   * already the minimised one the Balances screen shows, so this is the same
   * answer, applied — not a different calculation.
   */
  const settleEveryone = async () => {
    const confirmed = await confirm({
      title: 'Settle everyone up?',
      message:
        `This records all ${transfers.length} outstanding ` +
        `${transfers.length === 1 ? 'payment' : 'payments'} as paid. ` +
        'Use it when the money has actually moved — at a move-out, say.',
      confirmLabel: 'Record all',
    });

    if (!confirmed) return;

    setBusyKey('__all__');
    setError(null);

    try {
      // Sequential, so a failure part-way leaves a consistent ledger rather
      // than an unknown subset.
      for (const transfer of transfers) {
        await recordSettlement({
          groupId,
          fromUser: transfer.fromUser,
          toUser: transfer.toUser,
          amountCents: transfer.amountCents,
          note: group?.name ? `Final settle · ${group.name}` : 'Final settle',
        });
      }
      await refresh();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusyKey(null);
    }
  };

  const confirmManual = async (transfer: Transfer, label: string) => {
    const confirmed = await confirm({
      title: label,
      message: `Record ${formatMoney(transfer.amountCents)} between ${displayName(
        transfer.fromUser
      )} and ${displayName(transfer.toUser)}?`,
      confirmLabel: 'Record',
    });

    if (confirmed) await commitSettlement(transfer);
  };

  if (loading) return <Loading label="Working out who owes what" />;

  const mine = transfers.filter((t) => t.fromUser === userId);
  const incoming = transfers.filter((t) => t.toUser === userId);
  const others = transfers.filter((t) => t.fromUser !== userId && t.toUser !== userId);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <ErrorBanner message={error} /> : null}

      {transfers.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="Nothing to settle"
          message="Every balance in this group is already at zero."
          action={<Button title="Back to group" variant="secondary" onPress={() => router.back()} />}
        />
      ) : null}

      {mine.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>You owe</Text>
          {mine.map((transfer) => {
            const recipient = memberById.get(transfer.toUser);
            const key = transferKey(transfer);

            return (
              <Card key={key} style={styles.card}>
                <View style={styles.row}>
                  <Avatar name={recipient?.name ?? 'Roommate'} id={transfer.toUser} size={44} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      You owe {recipient?.name ?? 'a former member'}
                    </Text>
                    {recipient?.venmo_username ? (
                      <Text style={styles.rowMeta}>@{recipient.venmo_username}</Text>
                    ) : (
                      <Badge label="No Venmo username" tone="warning" />
                    )}
                  </View>
                  <Text style={styles.amount}>{formatMoney(transfer.amountCents)}</Text>
                </View>

                <Button
                  title="Pay in Venmo"
                  variant="venmo"
                  icon="arrow-forward-circle"
                  onPress={() => void payWithVenmo(transfer)}
                  disabled={busyKey === key}
                />
                <Button
                  title="Already paid — record it"
                  variant="ghost"
                  loading={busyKey === key}
                  onPress={() => void confirmManual(transfer, 'Record payment')}
                />
              </Card>
            );
          })}
        </>
      ) : null}

      {incoming.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Owed to you</Text>
          {incoming.map((transfer) => {
            const payer = memberById.get(transfer.fromUser);
            const key = transferKey(transfer);

            return (
              <Card key={key} style={styles.card}>
                <View style={styles.row}>
                  <Avatar name={payer?.name ?? 'Roommate'} id={transfer.fromUser} size={44} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{payer?.name ?? 'A former member'} owes you</Text>
                    <Text style={styles.rowMeta}>Settled when they pay — no reminders sent.</Text>
                  </View>
                  <Text style={[styles.amount, { color: colors.positive }]}>
                    {formatMoney(transfer.amountCents)}
                  </Text>
                </View>

                <Button
                  title="Mark as received"
                  variant="secondary"
                  loading={busyKey === key}
                  onPress={() => void confirmManual(transfer, 'Mark as received')}
                />
              </Card>
            );
          })}
        </>
      ) : null}

      {others.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Between others</Text>
          <Card style={styles.card}>
            {others.map((transfer) => (
              <View key={transferKey(transfer)} style={styles.otherRow}>
                <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
                <Text style={styles.otherText} numberOfLines={1}>
                  {displayName(transfer.fromUser)} → {displayName(transfer.toUser)}
                </Text>
                <Text style={styles.otherAmount}>{formatMoney(transfer.amountCents)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {transfers.length > 1 ? (
        <Card style={styles.card}>
          <Text style={styles.rowTitle}>Moving out?</Text>
          <Text style={styles.rowMeta}>
            Records all {transfers.length} payments at once, so nobody has to work through the list.
            Pay the amounts in Venmo first.
          </Text>
          <Button
            title="Settle everyone up"
            variant="secondary"
            icon="checkmark-done"
            loading={busyKey === '__all__'}
            onPress={() => void settleEveryone()}
          />
        </Card>
      ) : null}

      {transfers.length > 0 ? (
        <Text style={styles.footnote}>
          RoomLedger never moves money. Venmo opens with the amount and note filled in; the payment
          itself happens there.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function transferKey(transfer: Transfer): string {
  return `${transfer.fromUser}-${transfer.toUser}-${transfer.amountCents}`;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  sectionTitle: { ...typography.label, marginTop: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { ...typography.body, fontWeight: '600' },
  rowMeta: { ...typography.caption },
  amount: { ...typography.money, fontSize: 18 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  otherText: { ...typography.body, flex: 1, color: colors.textMuted },
  otherAmount: { ...typography.money, fontSize: 14 },
  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17, marginTop: spacing.sm },
});
