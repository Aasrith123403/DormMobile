import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../core/money';
import { useGroup } from '../data/groupContext';
import { colors, spacing, typography } from '../theme';

/**
 * Shared across every group tab. The net position is the first thing on
 * screen because it is the reason people open the app.
 */
export function GroupHeader({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  const { group, groupId, myNetCents, members } = useGroup();

  const settled = myNetCents === 0;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.push('/(app)/groups')} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.backLabel}>Groups</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push({ pathname: '/(app)/group-info', params: { groupId } })}
          hitSlop={8}
          accessibilityLabel="Group details and join code"
        >
          <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {group?.name ?? 'Group'}
      </Text>

      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>
          {settled ? 'All settled up' : myNetCents > 0 ? 'You are owed' : 'You owe'}
        </Text>
        {!settled ? (
          <Text
            style={[
              styles.balanceAmount,
              { color: myNetCents > 0 ? colors.positive : colors.negative },
            ]}
          >
            {formatMoney(Math.abs(myNetCents))}
          </Text>
        ) : null}
      </View>

      <Text style={styles.meta}>
        {subtitle ??
          `${members.length} ${members.length === 1 ? 'member' : 'members'} · code ${group?.join_code ?? '······'}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 2,
    backgroundColor: colors.background,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
  backLabel: { ...typography.body, color: colors.primary, fontWeight: '500' },
  title: { ...typography.title, fontSize: 26 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  balanceLabel: { ...typography.label },
  balanceAmount: { ...typography.moneyLarge, fontSize: 26 },
  meta: { ...typography.caption, marginTop: 2 },
});
