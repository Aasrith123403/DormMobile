import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirm, notify } from './dialog';
import { successFeedback } from './haptics';
import { FadeIn } from './motion';
import { Avatar, Badge, Button, Card, EmptyState, Field, Tappable } from './ui';
import { BoardChore, boardByPerson, unassignedChores } from '../core/chores';
import { ChoreFrequency, describeDue, isOverdue } from '../core/rotation';
import { todayIso } from '../core/subscriptions';
import { useAuth } from '../data/auth';
import { useGroup } from '../data/groupContext';
import { addChore, assignChore, completeChore, deleteChore } from '../data/mutations';
import { friendlyError } from '../lib/supabase';
import { colors, fonts, radius, spacing, typography } from '../theme';

const CHORE_SUGGESTIONS = ['Trash', 'Bathroom', 'Dishes', 'Vacuum', 'Kitchen', 'Recycling'];

export function ChoresPanel() {
  const router = useRouter();
  const { groupId, chores, choreOwners, members, refresh } = useGroup();
  const today = todayIso();
  const board = useMemo<BoardChore[]>(
    () =>
      chores.map((chore) => ({
        id: chore.id,
        name: chore.name,
        nextDue: chore.next_due,
        assignedTo: chore.assigned_to,
        ownerId: choreOwners.get(chore.id) ?? null,
      })),
    [chores, choreOwners]
  );

  const sections = useMemo(
    () => boardByPerson(board, members.map((m) => m.id), today),
    [board, members, today]
  );

  const needOwners = useMemo(() => unassignedChores(board), [board]);
  return (
    <>
      {chores.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="No chores yet"
          message="Write down what needs doing first. Once the list is there, you hand them out in one pass."
        />
      ) : null}

      {needOwners.length > 0 ? (
        <Tappable
          onPress={() => router.push({ pathname: '/(app)/chores/assign', params: { groupId } })}
          style={styles.assignBanner}
        >
          <Ionicons name="people-circle-outline" size={22} color={colors.primary} />
          <View style={styles.bannerBody}>
            <Text style={styles.bannerTitle}>
              Hand out {needOwners.length} {needOwners.length === 1 ? 'chore' : 'chores'}
            </Text>
            <Text style={styles.bannerMeta}>
              {needOwners.length === 1 ? 'It rotates' : 'They rotate'} automatically until you do.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Tappable>
      ) : null}

      {sections.map((section, index) => (
        <FadeIn key={section.userId ?? 'unassigned'} index={index} distance={6}>
          <PersonCard section={section} today={today} onRefresh={refresh} />
        </FadeIn>
      ))}

      <AddChoreCard />
    </>
  );
}

function PersonCard({
  section,
  today,
  onRefresh,
}: {
  section: ReturnType<typeof boardByPerson>[number];
  today: string;
  onRefresh: () => Promise<void>;
}) {
  const { userId } = useAuth();
  const { memberById } = useGroup();
  const member = section.userId ? memberById.get(section.userId) : null;
  const isYou = section.userId === userId;
  const name = section.userId ? (isYou ? 'You' : (member?.name ?? 'Someone')) : 'Nobody yet';
  return (
    <Card style={[styles.personCard, section.overdueCount > 0 && styles.personCardBehind]}>
      <View style={styles.personHead}>
        {section.userId ? (
          <Avatar name={member?.name ?? '?'} id={section.userId} size={36} />
        ) : (
          <View style={styles.emptyAvatar}>
            <Ionicons name="help" size={17} color={colors.textFaint} />
          </View>
        )}

        <View style={styles.personBody}>
          <Text style={[styles.personName, isYou && styles.personNameYou]}>{name}</Text>
          <Text style={styles.personMeta}>
            {section.chores.length === 0
              ? 'Nothing assigned'
              : `${section.chores.length} ${section.chores.length === 1 ? 'chore' : 'chores'}`}
            {section.rotatingCount > 0 ? ` · ${section.rotatingCount} on rotation` : ''}
          </Text>
        </View>

        {section.overdueCount > 0 ? <Badge label="Behind" tone="negative" /> : null}
      </View>

      {section.chores.map((chore) => (
        <ChoreRow key={chore.id} chore={chore} today={today} onRefresh={onRefresh} />
      ))}
    </Card>
  );
}

function ChoreRow({
  chore,
  today,
  onRefresh,
}: {
  chore: BoardChore;
  today: string;
  onRefresh: () => Promise<void>;
}) {
  const { userId } = useAuth();
  const { members } = useGroup();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const overdue = isOverdue(chore.nextDue, today);
  const done = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await completeChore(chore.id);
      successFeedback();
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not update', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const assign = async (nextUserId: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await assignChore(chore.id, nextUserId);
      successFeedback();
      setPicking(false);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not assign', message: friendlyError(caught) });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete chore?',
      message: `“${chore.name}” and its history will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteChore(chore.id);
      await onRefresh();
    } catch (caught) {
      await notify({ title: 'Could not delete', message: friendlyError(caught) });
    }
  };

  return (
    <View>
      <View style={styles.choreRow}>
        <Pressable
          onPress={() => setPicking((open) => !open)}
          onLongPress={() => void confirmDelete()}
          delayLongPress={450}
          accessibilityRole="button"
          accessibilityLabel={`${chore.name}. Tap to reassign, long press to delete.`}
          style={({ pressed }) => [styles.choreTap, pressed && styles.choreTapPressed]}
        >
          <Text style={styles.choreName} numberOfLines={1}>
            {chore.name}
          </Text>
          <Text style={[styles.choreDue, overdue && styles.choreDueLate]}>
            {describeDue(chore.nextDue, today)}
            {!chore.assignedTo ? ' · on rotation' : ''}
          </Text>
        </Pressable>

        <Tappable
          onPress={done}
          disabled={busy}
          accessibilityLabel={`Mark ${chore.name} done`}
          style={[styles.tick, overdue && styles.tickLate]}
        >
          <Ionicons
            name="checkmark"
            size={19}
            color={overdue ? colors.textInverse : colors.primary}
          />
        </Tappable>
      </View>

      {picking ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pickerRow}
        >
          {members.map((member) => {
            const active = chore.assignedTo === member.id;
            return (
              <Tappable
                key={member.id}
                onPress={() => void assign(active ? null : member.id)}
                disabled={busy}
                style={[styles.pickPerson, active && styles.pickPersonActive]}
              >
                <Avatar name={member.name} id={member.id} size={28} />
                <Text style={[styles.pickName, active && styles.pickNameActive]} numberOfLines={1}>
                  {member.id === userId ? 'You' : member.name}
                </Text>
              </Tappable>
            );
          })}

          <Tappable
            onPress={() => void assign(null)}
            disabled={busy || !chore.assignedTo}
            style={[styles.pickPerson, !chore.assignedTo && styles.pickPersonActive]}
          >
            <View style={styles.pickRotate}>
              <Ionicons name="sync" size={15} color={colors.textFaint} />
            </View>
            <Text style={[styles.pickName, !chore.assignedTo && styles.pickNameActive]}>Rotate</Text>
          </Tappable>
        </ScrollView>
      ) : null}
    </View>
  );
}

function AddChoreCard() {
  const { groupId, chores, refresh } = useGroup();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<ChoreFrequency>('weekly');
  const [adding, setAdding] = useState(false);
  const add = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      await addChore({ groupId, name: trimmed, frequency });
      setName('');
      successFeedback();
      await refresh();
    } catch (caught) {
      await notify({ title: 'Could not add', message: friendlyError(caught) });
    } finally {
      setAdding(false);
    }
  };

  const existing = new Set(chores.map((chore) => chore.name.toLowerCase()));
  const suggestions = CHORE_SUGGESTIONS.filter((s) => !existing.has(s.toLowerCase()));
  return (
    <Card style={styles.addCard}>
      <Text style={styles.cardTitle}>Add a chore</Text>

      {suggestions.length > 0 ? (
        <View style={styles.chipRow}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => void add(suggestion)}
              disabled={adding}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Ionicons name="add" size={13} color={colors.textMuted} />
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Field
        value={name}
        onChangeText={setName}
        placeholder="Something else"
        maxLength={60}
        returnKeyType="done"
        icon="clipboard-outline"
        onSubmitEditing={() => void add(name)}
      />

      {/* Only once there is something to add — until then it is a control
          asking about a chore that does not exist. */}
      {name.trim() ? (
        <>
          <View style={styles.frequencyRow}>
            {(['daily', 'weekly', 'biweekly', 'monthly'] as ChoreFrequency[]).map((value) => {
              const active = value === frequency;
              return (
                <Pressable
                  key={value}
                  onPress={() => setFrequency(value)}
                  style={[styles.freqChip, active && styles.freqChipActive]}
                >
                  <Text style={[styles.freqText, active && styles.freqTextActive]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>

          <Button
            title={`Add ${name.trim()}`}
            variant="secondary"
            loading={adding}
            onPress={() => void add(name)}
          />
        </>
      ) : (
        <Text style={styles.addHint}>Add them all first — you assign people in one pass after.</Text>
      )}
    </Card>
  );
}

export function AssignChoresList({
  draft,
  onPick,
}: {
  draft: Map<string, string | null>;
  onPick: (choreId: string, userId: string | null) => void;
}) {
  const { userId } = useAuth();
  const { chores, members } = useGroup();
  const ordered = useMemo(
    () =>
      [...chores].sort(
        (a, b) => a.next_due.localeCompare(b.next_due) || a.name.localeCompare(b.name)
      ),
    [chores]
  );

  return (
    <>
      {ordered.map((chore, index) => {
        const picked = draft.get(chore.id) ?? null;
        return (
          <FadeIn key={chore.id} index={index} distance={6}>
            <Card style={styles.assignCard}>
              <View style={styles.assignHead}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {chore.name}
                </Text>
                <Text style={styles.frequency}>{chore.frequency}</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.assignPeople}
              >
                {members.map((member) => {
                  const active = picked === member.id;
                  return (
                    <Tappable
                      key={member.id}
                      onPress={() => onPick(chore.id, active ? null : member.id)}
                      style={[styles.pickPerson, active && styles.pickPersonActive]}
                    >
                      <Avatar name={member.name} id={member.id} size={30} />
                      <Text
                        style={[styles.pickName, active && styles.pickNameActive]}
                        numberOfLines={1}
                      >
                        {member.id === userId ? 'You' : member.name}
                      </Text>
                    </Tappable>
                  );
                })}

                <Tappable
                  onPress={() => onPick(chore.id, null)}
                  style={[styles.pickPerson, picked === null && styles.pickPersonActive]}
                >
                  <View style={styles.pickRotate}>
                    <Ionicons name="sync" size={15} color={colors.textFaint} />
                  </View>
                  <Text style={[styles.pickName, picked === null && styles.pickNameActive]}>
                    Rotate
                  </Text>
                </Tappable>
              </ScrollView>
            </Card>
          </FadeIn>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...typography.heading },
  itemTitle: { ...typography.heading, fontSize: 16 },
  frequency: { ...typography.caption, textTransform: 'capitalize' },
  assignBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  bannerBody: { flex: 1, gap: 1 },
  bannerTitle: { ...typography.bodyStrong, color: colors.primary },
  bannerMeta: { ...typography.caption, fontSize: 12 },
  personCard: { gap: spacing.sm },
  personCardBehind: { borderColor: colors.negative, borderWidth: 1.5 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personBody: { flex: 1, gap: 1 },
  personName: { ...typography.bodyStrong },
  personNameYou: { color: colors.primary },
  personMeta: { ...typography.caption },
  choreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  choreTap: {
    flex: 1,
    gap: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
    borderRadius: radius.sm,
  },
  choreTapPressed: { backgroundColor: colors.surfaceAlt },
  choreName: { ...typography.body, fontSize: 15, fontFamily: fonts.semibold },
  choreDue: { ...typography.caption, fontSize: 12 },
  choreDueLate: { color: colors.negative, fontFamily: fonts.bold },
  tick: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  tickLate: { backgroundColor: colors.negative },
  emptyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickerRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  pickPerson: {
    alignItems: 'center',
    gap: 4,
    width: 66,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  pickPersonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pickName: { ...typography.caption, fontSize: 11.5, maxWidth: 60 },
  pickNameActive: { color: colors.primary, fontFamily: fonts.bold },
  pickRotate: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addCard: { gap: spacing.md, marginTop: spacing.sm },
  addHint: { ...typography.caption, marginTop: -spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.body, fontSize: 14 },
  frequencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  freqChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  freqChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  freqText: { ...typography.caption, fontSize: 12.5, textTransform: 'capitalize' },
  freqTextActive: { color: colors.primary, fontFamily: fonts.bold },
  assignCard: { gap: spacing.sm },
  assignHead: { gap: 1 },
  assignPeople: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
});
