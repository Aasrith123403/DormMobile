import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { notify } from '../../../../src/components/dialog';
import { Avatar, Card, EmptyState, ErrorBanner } from '../../../../src/components/ui';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import { setGroupStatus } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, radius, spacing, typography } from '../../../../src/theme';

/** Deliberately small and fixed — a status picker, not a chat. */
const STATUSES = [
  { emoji: '📚', label: 'Studying' },
  { emoji: '😴', label: 'Asleep' },
  { emoji: '👋', label: 'Friends over' },
  { emoji: '🏃', label: 'Out' },
  { emoji: '🎧', label: 'Do not disturb' },
  { emoji: '🍜', label: 'Around' },
];

export default function StatusScreen() {
  const { userId } = useAuth();
  const { groupId, members, statuses, error, refresh } = useGroup();
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const myStatus = statuses.find((s) => s.user_id === userId)?.status ?? null;

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const choose = async (label: string) => {
    if (!userId || busy) return;

    setBusy(true);
    try {
      // Tapping the current status again clears it.
      await setGroupStatus({ groupId, userId, status: label === myStatus ? 'Around' : label });
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader subtitle="What everyone is up to right now" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Set your status</Text>
          <View style={styles.chipGrid}>
            {STATUSES.map((status) => {
              const active = myStatus === status.label;
              return (
                <Pressable
                  key={status.label}
                  onPress={() => void choose(status.label)}
                  disabled={busy}
                  style={[styles.statusChip, active && styles.statusChipActive]}
                >
                  <Text style={styles.statusEmoji}>{status.emoji}</Text>
                  <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>
                    {status.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>The group</Text>

          {members.length === 0 ? (
            <EmptyState title="No members yet" />
          ) : (
            members.map((member) => {
              const record = statuses.find((s) => s.user_id === member.id);
              const emoji = STATUSES.find((s) => s.label === record?.status)?.emoji ?? '·';

              return (
                <View key={member.id} style={styles.memberRow}>
                  <Avatar name={member.name} id={member.id} size={38} />
                  <View style={styles.memberBody}>
                    <Text style={styles.memberName}>
                      {member.id === userId ? 'You' : member.name}
                    </Text>
                    <Text style={styles.memberStatus}>
                      {record ? `${emoji}  ${record.status}` : 'No status set'}
                    </Text>
                  </View>
                  {record ? <Text style={styles.timeAgo}>{timeAgo(record.updated_at)}</Text> : null}
                </View>
              );
            })
          )}
        </Card>

        <Text style={styles.footnote}>
          Statuses are visible to this group only, and nobody gets a notification when they change.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function timeAgo(isoTimestamp: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  return `${Math.round(hours / 24)}d`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  card: { gap: spacing.md },
  cardTitle: { ...typography.heading },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  statusEmoji: { fontSize: 16 },
  statusLabel: { ...typography.body, fontSize: 14 },
  statusLabelActive: { color: colors.primary, fontWeight: '700' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberBody: { flex: 1, gap: 2 },
  memberName: { ...typography.body, fontWeight: '600' },
  memberStatus: { ...typography.caption },
  timeAgo: { ...typography.caption, fontSize: 11 },

  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17 },
});
