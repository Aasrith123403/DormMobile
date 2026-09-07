import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { notify } from '../../../../src/components/dialog';
import { successFeedback } from '../../../../src/components/haptics';
import { CurvedHero, GradientNumber } from '../../../../src/components/shapes';
import { Avatar, Badge, Button, Card, Tappable } from '../../../../src/components/ui';
import { describeDue, isOverdue } from '../../../../src/core/rotation';
import { formatMoney } from '../../../../src/core/money';
import { PLACES, STATUSES } from '../../../../src/core/presence';
import { todayIso } from '../../../../src/core/subscriptions';
import { useAuth } from '../../../../src/data/auth';
import { useGroup } from '../../../../src/data/groupContext';
import { completeChore, setGroupStatus } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, fonts, radius, spacing, typography } from '../../../../src/theme';

const CLEAR_HOURS = 8;

export default function YouScreen() {
  const router = useRouter();
  const { userId, signOut } = useAuth();
  const { groupId, chores, choreOwners, statuses, myNetCents, transfers, memberById, refresh } =
    useGroup();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const me = userId ? memberById.get(userId) : null;
  const mine = statuses.find((s) => s.user_id === userId);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const myChores = useMemo(
    () =>
      chores
        .filter((chore) => choreOwners.get(chore.id) === userId)
        .sort((a, b) => a.next_due.localeCompare(b.next_due)),
    [chores, choreOwners, userId]
  );

  const save = async (next: { status?: string; place?: string | null }) => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await setGroupStatus({
        groupId,
        userId,
        status: next.status ?? mine?.status ?? 'Free',
        place: next.place !== undefined ? next.place : (mine?.place ?? null),
        clearsInHours: CLEAR_HOURS,
      });
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const tick = async (choreId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await completeChore(choreId);
      successFeedback();
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const settled = myNetCents === 0;
  const myTransfers = transfers.filter((t) => t.fromUser === userId || t.toUser === userId);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <CurvedHero
          tone={settled ? 'calm' : myNetCents > 0 ? 'positive' : 'negative'}
          contentStyle={styles.hero}
        >
          <Avatar name={me?.name ?? 'You'} id={userId ?? undefined} size={72} ring />
          <Text style={styles.name}>{me?.name ?? 'You'}</Text>
          <Text style={styles.netLabel}>
            {settled ? 'All settled up' : myNetCents > 0 ? 'You are owed' : 'You owe'}
          </Text>
          {!settled ? (

            <GradientNumber
              value={formatMoney(Math.abs(myNetCents))}
              size={44}
              tone={myNetCents > 0 ? 'positive' : 'sunset'}
              align="center"
              width={300}
            />
          ) : null}
        </CurvedHero>

        <View style={styles.body}>
          {!settled ? (
            <Button
              title={myNetCents < 0 ? 'Settle up' : 'See who owes you'}
              icon="swap-horizontal"
              onPress={() =>
                myNetCents < 0
                  ? router.push({ pathname: '/(app)/settle', params: { groupId } })
                  : router.push(`/(app)/groups/${groupId}/balances` as never)
              }
            />
          ) : null}

          {myTransfers.length > 0 ? (
            <Text style={styles.hint}>
              {myTransfers.length} {myTransfers.length === 1 ? 'payment' : 'payments'} would clear
              your side.
            </Text>
          ) : null}

          <Text style={styles.section}>Right now</Text>
          <Card style={styles.card}>
            <Text style={styles.chipsLabel}>What you&rsquo;re doing</Text>
            <View style={styles.chips}>
              {STATUSES.map((status) => {
                const active = mine?.status === status.label;
                return (
                  <Tappable
                    key={status.label}
                    disabled={busy}
                    onPress={() =>
                      void save({ status: active ? 'Free' : status.label })
                    }
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={styles.chipEmoji}>{status.emoji}</Text>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {status.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>

            <Text style={styles.chipsLabel}>Where you are</Text>
            <View style={styles.chips}>
              {PLACES.map((place) => {
                const active = mine?.place === place.id;
                return (
                  <Tappable
                    key={place.id}
                    disabled={busy}
                    onPress={() => void save({ place: active ? null : place.id })}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Ionicons
                      name={place.icon as never}
                      size={14}
                      color={active ? colors.action : colors.textSoft}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {place.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>

            <Text style={styles.footnote}>
              Tap again to clear. Clears itself after {CLEAR_HOURS} hours — and the place is
              something you say, never something the app reads.
            </Text>
          </Card>

          <Text style={styles.section}>Your chores</Text>
          {myChores.length === 0 ? (
            <Card style={styles.card}>
              <Text style={styles.emptyText}>Nothing assigned to you right now.</Text>
            </Card>
          ) : (
            <Card style={styles.card}>
              {myChores.map((chore) => {
                const late = isOverdue(chore.next_due, today);
                return (
                  <View key={chore.id} style={styles.choreRow}>
                    <View style={styles.choreBody}>
                      <Text style={styles.choreName}>{chore.name}</Text>
                      <Text style={[styles.choreDue, late && styles.choreDueLate]}>
                        {describeDue(chore.next_due, today)}
                      </Text>
                    </View>
                    {late ? <Badge label="Overdue" tone="negative" /> : null}
                    <Tappable
                      onPress={() => void tick(chore.id)}
                      disabled={busy}
                      accessibilityLabel={`Mark ${chore.name} done`}
                      style={[styles.tick, late && styles.tickLate]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={late ? colors.textInverse : colors.action}
                      />
                    </Tappable>
                  </View>
                );
              })}
            </Card>
          )}

          <Text style={styles.section}>Account</Text>
          <Card style={styles.linkCard} padded={false}>
            <LinkRow
              icon="person-circle-outline"
              label="Your profile"
              onPress={() => router.push('/(app)/profile')}
            />
            <LinkRow
              icon="people-outline"
              label="Invite housemates"
              onPress={() => router.push({ pathname: '/(app)/group-info', params: { groupId } })}
            />
            <LinkRow
              icon="albums-outline"
              label="Switch group"
              onPress={() => router.push('/(app)/groups')}
            />
            <LinkRow icon="log-out-outline" label="Sign out" destructive onPress={() => void signOut()} />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <Ionicons
        name={icon as never}
        size={20}
        color={destructive ? colors.negative : colors.textMuted}
      />
      <Text style={[styles.linkLabel, destructive && styles.linkLabelDestructive]}>{label}</Text>
      {!destructive ? (
        <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.xxl + 24, gap: 2 },
  name: {
    fontFamily: fonts.bold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: colors.textInverse,
    marginTop: spacing.md,
  },
  netLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.sm,
  },
  netAmount: {
    fontFamily: fonts.bold,
    fontSize: 38,
    lineHeight: 45,
    letterSpacing: -1.2,
    color: colors.textInverse,
  },

  body: { paddingHorizontal: spacing.xl, gap: spacing.md },
  section: { ...typography.title, marginTop: spacing.lg },
  hint: { ...typography.caption, textAlign: 'center' },
  card: { gap: spacing.md },
  emptyText: { ...typography.body },
  footnote: { ...typography.caption, fontSize: 12, lineHeight: 17 },
  chipsLabel: { ...typography.label, marginBottom: -spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.actionSoft },
  chipEmoji: { fontSize: 14 },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  chipTextActive: { fontFamily: fonts.semibold, color: colors.action },
  choreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choreBody: { flex: 1, gap: 1 },
  choreName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  choreDue: { ...typography.caption, fontSize: 12.5 },
  choreDueLate: { color: colors.negative, fontFamily: fonts.medium },
  tick: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionSoft,
  },
  tickLate: { backgroundColor: colors.negative },
  linkCard: { overflow: 'hidden' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  linkRowPressed: { backgroundColor: colors.surfaceAlt },
  linkLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  linkLabelDestructive: { color: colors.negative },
});
