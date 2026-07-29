import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { confirm, notify } from '../../src/components/dialog';
import { Avatar, Badge, Button, Card, ErrorBanner, Loading, Screen } from '../../src/components/ui';
import { formatMoney } from '../../src/core/money';
import { useAuth } from '../../src/data/auth';
import { GroupProvider, useGroup } from '../../src/data/groupContext';
import { leaveGroup } from '../../src/data/groups';
import { friendlyError } from '../../src/lib/supabase';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function GroupInfoRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  if (!groupId) return <ErrorBanner message="Missing group." />;

  return (
    <GroupProvider groupId={groupId}>
      <GroupInfoScreen />
    </GroupProvider>
  );
}

function GroupInfoScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { group, groupId, members, balances, expenses, loading } = useGroup();
  const [copied, setCopied] = useState(false);

  if (loading && !group) return <Loading />;

  const joinCode = group?.join_code ?? '';

  const copyCode = async () => {
    await Clipboard.setStringAsync(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const shareCode = async () => {
    const message = `Join "${group?.name}" on RoomLedger with code ${joinCode}`;

    try {
      await Share.share({ message });
    } catch {
      // Browsers without navigator.share reject outright — copying the invite
      // is the same job, so do that instead of surfacing a failure.
      await Clipboard.setStringAsync(message);
      await notify({ title: 'Invite copied', message: 'Paste it wherever you like.' });
    }
  };

  const confirmLeave = async () => {
    const myBalance = balances.find((b) => b.userId === userId)?.netCents ?? 0;

    const confirmed = await confirm({
      title: 'Leave this group?',
      message:
        myBalance === 0
          ? 'You can rejoin later with the join code.'
          : `You still have an unsettled balance of ${formatMoney(Math.abs(myBalance))}. Leaving does not clear it.`,
      confirmLabel: 'Leave',
      destructive: true,
    });

    if (!confirmed || !userId) return;

    try {
      await leaveGroup(groupId, userId);
      router.replace('/(app)/groups');
    } catch (caught) {
      await notify({ title: 'Could not leave', message: friendlyError(caught) });
    }
  };

  const totalSpentCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  return (
    <Screen scroll>
      <Card style={styles.codeCard}>
        <Text style={styles.codeLabel}>JOIN CODE</Text>
        <Pressable onPress={copyCode} accessibilityLabel="Copy join code">
          <Text style={styles.code}>{joinCode}</Text>
        </Pressable>
        <Text style={styles.codeHint}>
          {copied ? 'Copied to clipboard' : 'Tap the code to copy it'}
        </Text>

        <View style={styles.codeActions}>
          <Button title="Share invite" onPress={() => void shareCode()} style={styles.codeAction} />
          <Button
            title={copied ? 'Copied' : 'Copy'}
            variant="secondary"
            onPress={copyCode}
            style={styles.codeAction}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Members</Text>
        {members.map((member) => {
          const balance = balances.find((b) => b.userId === member.id)?.netCents ?? 0;

          return (
            <View key={member.id} style={styles.memberRow}>
              <Avatar name={member.name} id={member.id} size={38} />
              <View style={styles.memberBody}>
                <Text style={styles.memberName}>
                  {member.id === userId ? `${member.name} (you)` : member.name}
                </Text>
                <Text style={styles.memberMeta}>
                  {member.venmo_username ? `@${member.venmo_username}` : 'No Venmo username yet'}
                </Text>
              </View>
              {member.role === 'owner' ? <Badge label="Owner" tone="primary" /> : null}
              <Text
                style={[
                  styles.memberBalance,
                  balance > 0 && { color: colors.positive },
                  balance < 0 && { color: colors.negative },
                ]}
              >
                {balance === 0 ? '—' : formatMoney(Math.abs(balance))}
              </Text>
            </View>
          );
        })}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Group totals</Text>
        <View style={styles.statRow}>
          <Ionicons name="cash-outline" size={18} color={colors.textMuted} />
          <Text style={styles.statLabel}>Total logged</Text>
          <Text style={styles.statValue}>{formatMoney(totalSpentCents)}</Text>
        </View>
        <View style={styles.statRow}>
          <Ionicons name="receipt-outline" size={18} color={colors.textMuted} />
          <Text style={styles.statLabel}>Expenses</Text>
          <Text style={styles.statValue}>{expenses.length}</Text>
        </View>
        <View style={styles.statRow}>
          <Ionicons name="people-outline" size={18} color={colors.textMuted} />
          <Text style={styles.statLabel}>Members</Text>
          <Text style={styles.statValue}>{members.length}</Text>
        </View>
      </Card>

      <Button title="Leave group" variant="danger" onPress={() => void confirmLeave()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeCard: { alignItems: 'center', gap: spacing.xs },
  codeLabel: { ...typography.caption, letterSpacing: 1, fontWeight: '700' },
  code: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 8,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  codeHint: { ...typography.caption },
  codeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignSelf: 'stretch' },
  codeAction: { flex: 1 },

  card: { gap: spacing.md },
  cardTitle: { ...typography.heading },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberBody: { flex: 1, gap: 2 },
  memberName: { ...typography.body, fontWeight: '600' },
  memberMeta: { ...typography.caption },
  memberBalance: { ...typography.money, fontSize: 14, minWidth: 56, textAlign: 'right' },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statLabel: { ...typography.body, flex: 1, color: colors.textMuted },
  statValue: { ...typography.money },
});
