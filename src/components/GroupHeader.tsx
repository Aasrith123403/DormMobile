import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../core/money';
import { useGroup } from '../data/groupContext';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Shared across every group tab. The net position leads because it is the
 * reason people open the app; the group name and code sit underneath it.
 */
export function GroupHeader({ subtitle, action }: { subtitle?: string; action?: ReactNode }) {
  const router = useRouter();
  const { group, groupId, myNetCents, members } = useGroup();

  const settled = myNetCents === 0;
  const tone = settled ? colors.textMuted : myNetCents > 0 ? colors.positive : colors.negative;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={() => router.push('/(app)/groups')} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.backLabel}>Groups</Text>
        </Pressable>

        <View style={styles.actions}>
          {action}
          {/* A labelled pill, not a "…" menu: inviting roommates is the one
              thing people go looking for and could never find behind an
              anonymous overflow icon. */}
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/group-info', params: { groupId } })}
            accessibilityRole="button"
            accessibilityLabel="Invite people to this group"
            style={({ pressed }) => [styles.invite, pressed && styles.invitePressed]}
          >
            <Ionicons name="person-add" size={15} color={colors.primary} />
            <Text style={styles.inviteLabel}>Invite</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {group?.name ?? 'Group'}
      </Text>

      <View style={styles.balanceRow}>
        <Text style={[styles.balanceLabel, { color: tone }]}>
          {settled ? 'All settled up' : myNetCents > 0 ? 'You are owed' : 'You owe'}
        </Text>
        {!settled ? (
          <Text style={[styles.balanceAmount, { color: tone }]}>
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
    minHeight: 32,
  },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -6 },
  backLabel: { ...typography.body, color: colors.primary, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  invitePressed: { opacity: 0.7 },
  inviteLabel: { fontSize: 13, fontWeight: '800', color: colors.primary },

  title: { ...typography.title, fontSize: 27 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 2 },
  balanceLabel: { ...typography.label, letterSpacing: 0.4 },
  balanceAmount: { ...typography.moneyLarge, fontSize: 24 },
  meta: { ...typography.caption, marginTop: 3 },
});
