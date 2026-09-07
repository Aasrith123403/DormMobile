import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { notify } from '../../../src/components/dialog';
import { successFeedback } from '../../../src/components/haptics';
import { Button, Card, Field, Segmented, Tappable } from '../../../src/components/ui';
import {
  addDays,
  formatClock,
  formatDayHeading,
  formatShortDate,
  minutesOf,
} from '../../../src/core/calendar';
import { todayIso } from '../../../src/core/subscriptions';
import { useAuth } from '../../../src/data/auth';
import { GroupProvider, useGroup } from '../../../src/data/groupContext';
import { addEvent } from '../../../src/data/mutations';
import { friendlyError } from '../../../src/lib/supabase';
import { colors, fonts, radius, spacing, typography } from '../../../src/theme';

const TITLE_SUGGESTIONS = [
  'House dinner',
  'Movie night',
  'Cleaning day',
  'Study session',
  'Guests over',
  'Move-out',
];

const TIME_SLOTS = Array.from({ length: 34 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const DURATIONS = [
  { label: 'No end', hours: 0 },
  { label: '1 hr', hours: 1 },
  { label: '2 hrs', hours: 2 },
  { label: '3 hrs', hours: 3 },
];

const DATE_HORIZON_DAYS = 90;

function useStripScroll(selected: string) {
  const ref = useRef<ScrollView>(null);
  const settled = useRef(false);
  const onLayout = (key: string) => (event: LayoutChangeEvent) => {
    if (settled.current || key !== selected) return;
    settled.current = true;
    const { x } = event.nativeEvent.layout;
    ref.current?.scrollTo({ x: Math.max(0, x - spacing.xl), animated: false });
  };

  return { ref, onLayout };
}

export default function NewEventScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <GroupProvider groupId={groupId}>
      <NewEventForm />
    </GroupProvider>
  );
}

function NewEventForm() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, refresh } = useGroup();
  const { date: initialDate } = useLocalSearchParams<{ date?: string }>();
  const today = todayIso();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate && initialDate >= today ? initialDate : today);
  const [timed, setTimed] = useState<'all-day' | 'at-a-time'>('at-a-time');
  const [startTime, setStartTime] = useState('19:00');
  const [durationHours, setDurationHours] = useState(0);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const dateStrip = useStripScroll(date);
  const timeStrip = useStripScroll(startTime);
  const dates = useMemo(
    () => Array.from({ length: DATE_HORIZON_DAYS }, (_, index) => addDays(today, index)),
    [today]
  );

  const endTime = useMemo(() => {
    if (timed === 'all-day' || durationHours === 0) return null;
    const start = minutesOf(startTime);
    if (start === null) return null;
    const end = start + durationHours * 60;
    if (end >= 24 * 60) return null;
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  }, [timed, startTime, durationHours]);

  const canSave = Boolean(title.trim()) && Boolean(userId);
  const save = async () => {
    if (!canSave || !userId || saving) return;
    setSaving(true);
    try {
      await addEvent({
        groupId,
        createdBy: userId,
        title,
        date,
        startTime: timed === 'at-a-time' ? startTime : null,
        endTime,
        location,
        note,
      });
      successFeedback();
      await refresh();
      router.back();
    } catch (caught) {
      await notify({ title: 'Could not save', message: friendlyError(caught) });
    } finally {
      setSaving(false);
    }
  };

  return (

    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"

          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            <Field
              label="What is it"
              value={title}
              onChangeText={setTitle}
              placeholder="House dinner"
              maxLength={80}

              returnKeyType="next"
              icon="calendar-outline"
            />

            <View style={styles.chipRow}>
              {TITLE_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => setTitle(suggestion)}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>When</Text>
              <Text style={styles.labelValue}>{formatDayHeading(date, today)}</Text>
            </View>

            <ScrollView
              ref={dateStrip.ref}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
            >
              {dates.map((value) => {
                const active = value === date;
                return (
                  <View key={value} onLayout={dateStrip.onLayout(value)}>
                    <Tappable
                      onPress={() => setDate(value)}
                      style={[styles.dateChip, active && styles.dateChipActive]}
                    >
                      <Text style={[styles.dateChipDay, active && styles.dateChipTextActive]}>
                        {formatShortDate(value).split(' ')[1]}
                      </Text>
                      <Text style={[styles.dateChipMonth, active && styles.dateChipTextActive]}>
                        {formatShortDate(value).split(' ')[0]}
                      </Text>
                    </Tappable>
                  </View>
                );
              })}
            </ScrollView>

            <Segmented
              options={[
                { label: 'At a time', value: 'at-a-time' },
                { label: 'All day', value: 'all-day' },
              ]}
              value={timed}
              onChange={setTimed}
            />

            {timed === 'at-a-time' ? (
              <>
                <ScrollView
                  ref={timeStrip.ref}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.strip}
                >
                  {TIME_SLOTS.map((slot) => {
                    const active = slot === startTime;
                    return (
                      <View key={slot} onLayout={timeStrip.onLayout(slot)}>
                        <Tappable
                          onPress={() => setStartTime(slot)}
                          style={[styles.timeChip, active && styles.timeChipActive]}
                        >
                          <Text style={[styles.timeChipText, active && styles.dateChipTextActive]}>
                            {formatClock(slot)}
                          </Text>
                        </Tappable>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.durationRow}>
                  {DURATIONS.map((duration) => {
                    const active = duration.hours === durationHours;
                    return (
                      <Tappable
                        key={duration.label}
                        onPress={() => setDurationHours(duration.hours)}
                        style={[styles.durationChip, active && styles.timeChipActive]}
                      >
                        <Text style={[styles.timeChipText, active && styles.dateChipTextActive]}>
                          {duration.label}
                        </Text>
                      </Tappable>
                    );
                  })}
                </View>

                <Text style={styles.hint}>
                  {endTime
                    ? `${formatClock(startTime)} – ${formatClock(endTime)}`
                    : `Starts at ${formatClock(startTime)}`}
                </Text>
              </>
            ) : (
              <Text style={styles.hint}>Shows on the day without a time.</Text>
            )}
          </Card>

          <Card style={styles.card}>
            <Field
              label="Where (optional)"
              value={location}
              onChangeText={setLocation}
              placeholder="Kitchen"
              maxLength={80}
              icon="location-outline"
            />
            <Field
              label="Anything else (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="Bring something to share"
              maxLength={280}
              multiline
              icon="create-outline"
            />
          </Card>

          <View style={styles.note}>
            <Ionicons name="people-outline" size={15} color={colors.textFaint} />
            <Text style={styles.noteText}>
              Everyone in the group sees this. Nobody is notified — it just appears on the calendar.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={canSave ? `Add to ${formatDayHeading(date, today).toLowerCase()}` : 'Name it first'}
            loading={saving}
            disabled={!canSave}
            onPress={() => void save()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 130, gap: spacing.md },
  card: { gap: spacing.md },
  label: { ...typography.label },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelValue: { ...typography.bodyStrong, color: colors.primary },
  hint: { ...typography.caption, marginTop: -spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.body, fontSize: 14 },
  strip: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  dateChip: {
    width: 52,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dateChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  dateChipDay: { ...typography.heading, fontSize: 17 },
  dateChipMonth: { ...typography.caption, fontSize: 11 },
  dateChipTextActive: { color: colors.primary, fontFamily: fonts.bold },
  timeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  timeChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  timeChipText: { ...typography.body, fontSize: 14 },
  durationRow: { flexDirection: 'row', gap: spacing.sm },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },

  note: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs },
  noteText: { ...typography.caption, flex: 1, lineHeight: 17 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
