import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssignChoresList } from '../../../src/components/ChoresPanel';
import { notify } from '../../../src/components/dialog';
import { successFeedback } from '../../../src/components/haptics';
import { Avatar, Button, Card, EmptyState, Loading } from '../../../src/components/ui';
import { BoardChore, assignmentCounts, balanceAssignments } from '../../../src/core/chores';
import { useAuth } from '../../../src/data/auth';
import { GroupProvider, useGroup } from '../../../src/data/groupContext';
import { assignChores } from '../../../src/data/mutations';
import { friendlyError } from '../../../src/lib/supabase';
import { colors, spacing, typography } from '../../../src/theme';

export default function AssignChoresScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <GroupProvider groupId={groupId}>
      <AssignChores />
    </GroupProvider>
  );
}

function AssignChores() {
  const router = useRouter();
  const { userId } = useAuth();
  const { chores, members, loading, refresh } = useGroup();
  const [picks, setPicks] = useState<Map<string, string | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const draft = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const chore of chores) {
      map.set(chore.id, picks.has(chore.id) ? (picks.get(chore.id) ?? null) : chore.assigned_to);
    }
    return map;
  }, [chores, picks]);

  const pending = useMemo(
    () =>
      chores
        .filter((chore) => (draft.get(chore.id) ?? null) !== chore.assigned_to)
        .map((chore) => ({ choreId: chore.id, userId: draft.get(chore.id) ?? null })),
    [chores, draft]
  );

  const counts = useMemo(() => {
    const board: BoardChore[] = chores.map((chore) => ({
      id: chore.id,
      name: chore.name,
      nextDue: chore.next_due,
      assignedTo: draft.get(chore.id) ?? null,
      ownerId: draft.get(chore.id) ?? null,
    }));
    return assignmentCounts(board, members.map((m) => m.id));
  }, [chores, draft, members]);

  const pick = (choreId: string, next: string | null) => {
    setPicks((current) => {
      const updated = new Map(current);
      updated.set(choreId, next);
      return updated;
    });
  };

  const splitEvenly = () => {
    const board: BoardChore[] = chores.map((chore) => ({
      id: chore.id,
      name: chore.name,
      nextDue: chore.next_due,
      assignedTo: draft.get(chore.id) ?? null,
      ownerId: draft.get(chore.id) ?? null,
    }));

    const suggested = balanceAssignments(board, members.map((m) => m.id));
    if (suggested.length === 0) return;
    successFeedback();
    setPicks((current) => {
      const updated = new Map(current);
      for (const row of suggested) updated.set(row.choreId, row.userId);
      return updated;
    });
  };

  const save = async () => {
    if (saving) return;
    if (pending.length === 0) {
      router.back();
      return;
    }

    setSaving(true);
    try {
      await assignChores(pending);
      successFeedback();
      await refresh();
      router.back();
    } catch (caught) {
      await notify({ title: 'Could not save', message: friendlyError(caught) });
    } finally {
      setSaving(false);
    }
  };

  if (loading && chores.length === 0) return <Loading label="Loading chores" />;
  if (chores.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <EmptyState
          icon="clipboard-outline"
          title="Nothing to assign yet"
          message="Add the chores first, on the House tab. Then come back and hand them out."
          action={<Button title="Back" variant="secondary" onPress={() => router.back()} />}
        />
      </SafeAreaView>
    );
  }

  const unclaimed = chores.filter((chore) => (draft.get(chore.id) ?? null) === null).length;
  return (

    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.summary}>
          <Text style={styles.summaryTitle}>How it splits</Text>

          <View style={styles.tally}>
            {members.map((member) => (
              <View key={member.id} style={styles.tallyPerson}>
                <Avatar name={member.name} id={member.id} size={32} />
                <Text style={styles.tallyName} numberOfLines={1}>
                  {member.id === userId ? 'You' : member.name}
                </Text>
                <Text style={styles.tallyCount}>{counts[member.id] ?? 0}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.summaryMeta}>
            {unclaimed === 0
              ? 'Everything has an owner.'
              : `${unclaimed} left on rotation — the app picks whoever has done it least.`}
          </Text>

          <Button
            title="Split the rest evenly"
            variant="secondary"
            icon="shuffle"
            disabled={unclaimed === 0 || members.length === 0}
            onPress={splitEvenly}
          />
        </Card>

        <AssignChoresList draft={draft} onPick={pick} />

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textFaint} />
          <Text style={styles.noteText}>
            Anyone can still mark any chore done — assigning says whose job it is, not who is
            allowed.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerMeta}>
          {pending.length === 0
            ? 'No changes yet'
            : `${pending.length} ${pending.length === 1 ? 'change' : 'changes'}`}
        </Text>
        <Button
          title={pending.length === 0 ? 'Done' : 'Save assignments'}
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 140, gap: spacing.md },
  summary: { gap: spacing.md },
  summaryTitle: { ...typography.heading },
  summaryMeta: { ...typography.caption, lineHeight: 18 },
  tally: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  tallyPerson: { alignItems: 'center', gap: 3, width: 64 },
  tallyName: { ...typography.caption, fontSize: 11.5, maxWidth: 62 },
  tallyCount: { ...typography.heading, fontSize: 18 },
  note: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs },
  noteText: { ...typography.caption, flex: 1, lineHeight: 17 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerMeta: { ...typography.caption, textAlign: 'center' },
});
