import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '../../../../src/components/GroupHeader';
import { confirm, notify } from '../../../../src/components/dialog';
import { FadeIn } from '../../../../src/components/motion';
import { Avatar, Card, EmptyState, ErrorBanner, Tappable } from '../../../../src/components/ui';
import {
  AgendaItem,
  WEEKDAY_INITIALS,
  agendaFor,
  buildAgenda,
  buildMonthGrid,
  formatDayHeading,
  formatShortDate,
  monthKeyOf,
  monthLabel,
  shiftMonth,
  upcomingAgenda,
} from '../../../../src/core/calendar';
import { todayIso } from '../../../../src/core/subscriptions';
import { useGroup } from '../../../../src/data/groupContext';
import { deleteEvent } from '../../../../src/data/mutations';
import { friendlyError } from '../../../../src/lib/supabase';
import { colors, fonts, radius, spacing, typography } from '../../../../src/theme';

const KIND_COLOR: Record<AgendaItem['kind'], string> = {
  event: colors.primary,
  chore: colors.warning,
  money: colors.textMuted,
};

export default function CalendarScreen() {
  const router = useRouter();
  const {
    groupId,
    events,
    chores,
    choreOwners,
    subscriptions,
    expenses,
    displayName,
    error,
    refresh,
  } = useGroup();

  const today = todayIso();
  const [month, setMonth] = useState(() => monthKeyOf(today));
  const [selected, setSelected] = useState(today);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const agenda = useMemo(
    () =>
      buildAgenda({
        events: events.map((event) => ({
          id: event.id,
          title: event.title,
          date: event.event_date,
          startTime: event.start_time,
          endTime: event.end_time,
          location: event.location,
          createdBy: event.created_by,
        })),
        chores: chores.map((chore) => ({
          id: chore.id,
          name: chore.name,
          nextDue: chore.next_due,
          ownerId: choreOwners.get(chore.id) ?? null,
        })),
        money: [
          ...subscriptions
            .filter((s) => s.active)
            .map((s) => ({
              id: `sub-${s.id}`,
              name: s.name,
              dueDate: s.next_charge_date,
              amountCents: s.monthlyCostCents,
            })),
          ...expenses
            .filter((e) => e.repeat_interval && e.repeat_next_date)
            .map((e) => ({
              id: `rep-${e.id}`,
              name: e.description,
              dueDate: e.repeat_next_date!,
              amountCents: e.amountCents,
            })),
        ],
        nameOf: displayName,
      }),
    [events, chores, choreOwners, subscriptions, expenses, displayName]
  );

  const grid = useMemo(() => buildMonthGrid(month, today), [month, today]);
  const dayItems = agendaFor(agenda, selected);
  const upcoming = useMemo(() => upcomingAgenda(agenda, today, { limit: 3 }), [agenda, today]);
  const goToMonth = (delta: number) => setMonth((current) => shiftMonth(current, delta));
  const jumpToToday = () => {
    setMonth(monthKeyOf(today));
    setSelected(today);
  };

  const eventsThisMonth = events.filter((e) => monthKeyOf(e.event_date) === month).length;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <GroupHeader
        title="Calendar"
        tone="violet"
        subtitle={
          eventsThisMonth > 0
            ? `${eventsThisMonth} ${eventsThisMonth === 1 ? 'event' : 'events'} in ${monthLabel(month).split(' ')[0]}`
            : 'Nothing planned yet'
        }
        action={
          <Pressable onPress={jumpToToday} hitSlop={8} accessibilityLabel="Jump to today">
            <Ionicons name="today-outline" size={21} color={colors.textMuted} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        <Card style={styles.monthCard}>
          <View style={styles.monthHead}>
            <Pressable onPress={() => goToMonth(-1)} hitSlop={10} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthTitle}>{monthLabel(month)}</Text>
            <Pressable onPress={() => goToMonth(1)} hitSlop={10} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <Text key={index} style={styles.weekLabel}>
                {initial}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((day) => {
              const items = agendaFor(agenda, day.date);
              const isSelected = day.date === selected;
              return (
                <Pressable
                  key={day.date}
                  onPress={() => setSelected(day.date)}
                  style={styles.cell}
                  accessibilityLabel={`${formatShortDate(day.date)}, ${items.length} items`}
                >
                  <View
                    style={[
                      styles.cellInner,
                      day.isToday && styles.cellToday,
                      isSelected && styles.cellSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        !day.inMonth && styles.cellTextOutside,
                        day.isToday && styles.cellTextToday,
                        isSelected && styles.cellTextSelected,
                      ]}
                    >
                      {day.day}
                    </Text>
                  </View>

                  <View style={styles.dots}>
                    {[...new Set(items.map((item) => item.kind))].slice(0, 3).map((kind) => (

                      <View key={kind} style={[styles.dot, { backgroundColor: KIND_COLOR[kind] }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <View style={styles.dayHead}>
          <Text style={styles.dayTitle}>{formatDayHeading(selected, today)}</Text>
          <Tappable
            onPress={() =>
              router.push({ pathname: '/(app)/event/new', params: { groupId, date: selected } })
            }
            style={styles.addPill}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addPillText}>Add event</Text>
          </Tappable>
        </View>

        {dayItems.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Nothing on this day"
            message="Plan something and everyone in the house sees it here."
          />
        ) : (
          dayItems.map((item, index) => (
            <FadeIn key={item.id} index={index} distance={6}>
              <AgendaRow item={item} onRefresh={refresh} />
            </FadeIn>
          ))
        )}

        {upcoming.length > 0 && dayItems.length === 0 ? (
          <>
            <Text style={styles.sectionLabel}>Coming up</Text>
            {upcoming.map((item) => (
              <Tappable key={item.id} onPress={() => setSelected(item.date)} style={styles.upcomingRow}>
                <View style={[styles.upcomingDot, { backgroundColor: KIND_COLOR[item.kind] }]} />
                <View style={styles.upcomingBody}>
                  <Text style={styles.upcomingTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.upcomingMeta} numberOfLines={1}>
                    {formatDayHeading(item.date, today)}
                    {item.time ? ` · ${item.time}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Tappable>
            ))}
          </>
        ) : null}

        <Text style={styles.footnote}>
          Chore due dates and recurring bills show up here on their own — you only add the plans.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function AgendaRow({ item, onRefresh }: { item: AgendaItem; onRefresh: () => Promise<void> }) {
  const { memberById } = useGroup();
  const isEvent = item.kind === 'event';
  const remove = async () => {
    const confirmed = await confirm({
      title: 'Remove from the calendar?',
      message: `“${item.title}” disappears for everyone in the group.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteEvent(item.id.replace(/^event-/, ''));
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not remove', message: friendlyError(caught) });
    }
  };

  return (
    <Card style={styles.agendaCard}>
      <View style={[styles.kindBar, { backgroundColor: KIND_COLOR[item.kind] }]} />

      <View style={styles.agendaBody}>
        <Text style={styles.agendaTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.agendaMeta} numberOfLines={2}>
          {item.time ?? (isEvent ? 'All day' : null)}
          {item.time || isEvent ? (item.detail ? ' · ' : '') : ''}
          {item.detail ?? ''}
        </Text>
      </View>

      {item.ownerId ? (
        <Avatar name={memberById.get(item.ownerId)?.name ?? '?'} id={item.ownerId} size={30} />
      ) : (
        <Ionicons name={item.icon as never} size={18} color={colors.textFaint} />
      )}

      {isEvent ? (
        <Pressable onPress={() => void remove()} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
  monthCard: { gap: spacing.md },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { ...typography.heading, fontSize: 17 },
  weekRow: { flexDirection: 'row' },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    ...typography.caption,
    fontSize: 11,
    fontFamily: fonts.bold,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3, gap: 2 },
  cellInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: { backgroundColor: colors.primarySoft },
  cellSelected: { backgroundColor: colors.primary },
  cellText: { ...typography.body, fontSize: 15, fontFamily: fonts.semibold },
  cellTextOutside: { color: colors.textFaint, fontFamily: fonts.regular },
  cellTextToday: { color: colors.primary, fontFamily: fonts.bold },
  cellTextSelected: { color: colors.textInverse, fontFamily: fonts.bold },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  dayTitle: { ...typography.heading, fontSize: 18 },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  addPillText: { fontSize: 13, fontFamily: fonts.bold, color: colors.primary },
  agendaCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  kindBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginVertical: -spacing.xs },
  agendaBody: { flex: 1, gap: 2 },
  agendaTitle: { ...typography.bodyStrong },
  agendaMeta: { ...typography.caption },
  sectionLabel: { ...typography.label, marginTop: spacing.sm },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  upcomingDot: { width: 8, height: 8, borderRadius: 4 },
  upcomingBody: { flex: 1, gap: 1 },
  upcomingTitle: { ...typography.bodyStrong, fontSize: 15 },
  upcomingMeta: { ...typography.caption },
  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17, marginTop: spacing.sm },
});
