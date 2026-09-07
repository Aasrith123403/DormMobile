import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { notify } from '../../../../src/components/dialog';
import { successFeedback } from '../../../../src/components/haptics';
import { GlowOrb, GradientNumber, Smiley } from '../../../../src/components/shapes';
import { Timeline, TimelineEntry } from '../../../../src/components/timeline';
import { Avatar, Button, ErrorBanner, Loading } from '../../../../src/components/ui';
import { FeedEntry, FeedEntryKind, feedTimeAgo } from '../../../../src/core/feed';
import { formatMoney } from '../../../../src/core/money';
import { useGroup } from '../../../../src/data/groupContext';
import { PING_RESPONSES, useHouseFeed } from '../../../../src/data/useHouseFeed';
import { completeChore, respondToPing } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, fonts, gradients, radius, spacing, typography } from '../../../../src/theme';

const TONE_BY_KIND: Record<FeedEntryKind, keyof typeof gradients> = {
  ping: 'sunset',
  event: 'violet',
  'supply-needed': 'brand',
  upcoming: 'brand',
  expense: 'calm',
  'supply-bought': 'positive',
  'chore-done': 'positive',
  settlement: 'positive',
  status: 'calm',
  'month-summary': 'calm',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const router = useRouter();
  const { groupId, group, memberById, myNetCents, loading, error, refresh } = useGroup();
  const { actionable, history, thisMonth } = useHouseFeed();
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const settled = myNetCents === 0;
  const numberTone: keyof typeof gradients = settled
    ? 'calm'
    : myNetCents > 0
      ? 'positive'
      : 'sunset';

  const run = async (id: string, work: () => Promise<void>, failure: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await work();
      successFeedback();
      await refresh();
    } catch (caught) {
      await notify({ title: failure, message: friendlyError(caught) });
    } finally {
      setBusyId(null);
    }
  };

  const timeline = useMemo<TimelineEntry[]>(
    () =>
      actionable.map((entry) => ({
        id: entry.id,
        title: entry.title,
        meta: [
          ...(entry.detail ? [{ label: entry.detail }] : []),
          ...(entry.amountCents !== null
            ? [{ icon: 'cash-outline', label: formatMoney(entry.amountCents) }]
            : []),
        ],
        tone: TONE_BY_KIND[entry.kind],
        icon: entry.icon,
        action: <InlineAction entry={entry} busyId={busyId} onRun={run} />,
      })),
    [actionable, busyId]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <GlowOrb size={340} tone="brand" opacity={0.4} style={styles.glowRight} />
        <GlowOrb size={260} tone="violet" opacity={0.3} style={styles.glowLeft} />

        <View style={styles.header}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.push('/(app)/groups')}
              hitSlop={8}
              style={styles.groupPill}
              accessibilityLabel="Switch group"
            >
              <View style={styles.groupDot} />
              <Text style={styles.groupName} numberOfLines={1}>
                {group?.name ?? 'Your house'}
              </Text>
              <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push({ pathname: '/(app)/group-info', params: { groupId } })}
              hitSlop={8}
              style={styles.iconButton}
              accessibilityLabel="Invite people"
            >
              <Ionicons name="person-add-outline" size={18} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.greeting}>{greeting()}</Text>

          <GradientNumber
            value={settled ? 'All square' : formatMoney(Math.abs(myNetCents))}
            size={settled ? 34 : 54}
            tone={numberTone}
            width={330}
          />

          <Text style={styles.netLabel}>
            {settled
              ? 'Nobody owes anybody'
              : myNetCents > 0
                ? "you're owed across the house"
                : 'you owe across the house'}
            {!thisMonth.isEmpty ? ` · ${formatMoney(thisMonth.totalCents)} spent this month` : ''}
          </Text>
        </View>

        <View style={styles.body}>
          {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

          {/* The only way to create anything, and the only lit control. */}
          <Button
            title="What's on your mind?"
            icon="add"
            onPress={() => router.push({ pathname: '/(app)/add', params: { groupId } })}
          />

          {loading && actionable.length === 0 && history.length === 0 ? (
            <Loading label="Catching up" />
          ) : null}

          {timeline.length > 0 ? (
            <>
              <Text style={styles.section}>Waiting on you</Text>
              <Timeline entries={timeline} />
            </>
          ) : !loading ? (
            <View style={styles.clear}>
              <Smiley size={78} tone="brand" />
              <Text style={styles.clearTitle}>Nothing needs you</Text>
              <Text style={styles.clearBody}>
                No chores due, nothing run out, nobody waiting on a reply.
              </Text>
            </View>
          ) : null}

          {history.length > 0 ? (
            <>
              <Text style={styles.section}>Around the house</Text>
              <View style={styles.historyCard}>
                {history.slice(0, 12).map((entry, index) => (
                  <HistoryRow
                    key={entry.id}
                    entry={entry}
                    first={index === 0}
                    avatarName={entry.actorId ? (memberById.get(entry.actorId)?.name ?? '?') : '?'}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InlineAction({
  entry,
  busyId,
  onRun,
}: {
  entry: FeedEntry;
  busyId: string | null;
  onRun: (id: string, work: () => Promise<void>, failure: string) => Promise<void>;
}) {
  const busy = busyId === entry.id;
  if (entry.kind === 'ping') {
    const pingId = entry.id.replace(/^ping-/, '');
    return (
      <View style={styles.replies}>
        {PING_RESPONSES.map((response) => (
          <Pressable
            key={response.id}
            disabled={busy}
            onPress={() =>
              void onRun(entry.id, () => respondToPing(pingId, response.id), 'Could not reply')
            }
            style={({ pressed }) => [styles.reply, pressed && styles.pressed]}
          >
            <Text style={styles.replyText}>{response.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  if (entry.kind === 'upcoming' && entry.id.startsWith('chore-due-')) {
    const choreId = entry.id.replace(/^chore-due-/, '');
    return (
      <Pressable
        disabled={busy}
        onPress={() => void onRun(entry.id, () => completeChore(choreId), 'Could not update')}
        style={({ pressed }) => [styles.doneChip, pressed && styles.pressed]}
      >
        <Ionicons name="checkmark" size={14} color={colors.textInverse} />
        <Text style={styles.doneChipText}>Mark done</Text>
      </Pressable>
    );
  }

  return null;
}

function HistoryRow({
  entry,
  avatarName,
  first,
}: {
  entry: FeedEntry;
  avatarName: string;
  first: boolean;
}) {
  return (
    <View style={[styles.historyRow, !first && styles.historyRowDivided]}>
      {entry.actorId ? (
        <Avatar name={avatarName} id={entry.actorId} size={34} />
      ) : (
        <View style={styles.historyGlyph}>
          <Ionicons name={entry.icon as never} size={16} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.historyBody}>
        <Text style={styles.historyTitle} numberOfLines={2}>
          {entry.title}
        </Text>
        {entry.detail ? (
          <Text style={styles.historyDetail} numberOfLines={1}>
            {entry.detail}
          </Text>
        ) : null}
      </View>

      <View style={styles.historyTail}>
        {entry.amountCents !== null ? (
          <Text style={styles.historyMoney}>{formatMoney(entry.amountCents)}</Text>
        ) : null}
        <Text style={styles.historyTime}>{feedTimeAgo(entry.at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxxl },
  glowRight: { position: 'absolute', top: -170, right: -120 },
  glowLeft: { position: 'absolute', top: -130, left: -110 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: 2 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '72%',
    paddingVertical: 9,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  groupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink },
  groupName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  greeting: { fontFamily: fonts.regular, fontSize: 14.5, color: colors.textMuted },
  netLabel: { ...typography.caption, marginTop: -spacing.xs, lineHeight: 18 },
  body: { paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.lg },
  section: { ...typography.title, marginTop: spacing.lg },
  clear: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  clearTitle: { ...typography.title, marginTop: spacing.sm },
  clearBody: { ...typography.body, textAlign: 'center', maxWidth: 270 },
  replies: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reply: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  pressed: { opacity: 0.6 },
  replyText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.text },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  doneChipText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.textInverse },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  historyRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  historyGlyph: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBody: { flex: 1, gap: 1 },
  historyTitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.text },
  historyDetail: { ...typography.caption, fontSize: 12 },
  historyTail: { alignItems: 'flex-end', gap: 2 },
  historyMoney: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text },
  historyTime: { fontFamily: fonts.regular, fontSize: 11, color: colors.textFaint },
});
