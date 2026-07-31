import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  Field,
  Loading,
  SectionHeader,
} from '../../../src/components/ui';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { CategoryId, detectCategory } from '../../../src/core/categories';
import { formatMoney, parseAmountInput } from '../../../src/core/money';
import { evenSplit } from '../../../src/core/splits';
import { addMonths, describeNextCharge, todayIso } from '../../../src/core/subscriptions';
import { useAuth } from '../../../src/data/auth';
import { GroupProvider, useGroup } from '../../../src/data/groupContext';
import { addSubscription } from '../../../src/data/mutations';
import { friendlyError } from '../../../src/lib/supabase';
import { colors, radius, spacing, typography } from '../../../src/theme';

const PRESETS = [
  { name: 'Netflix', cost: '15.49' },
  { name: 'Spotify', cost: '16.99' },
  { name: 'Internet', cost: '60.00' },
  { name: 'Hulu', cost: '18.99' },
];

export default function NewSubscriptionRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  if (!groupId) return <ErrorBanner message="Missing group." />;

  return (
    <GroupProvider groupId={groupId}>
      <NewSubscriptionScreen />
    </GroupProvider>
  );
}

function NewSubscriptionScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, members, loading } = useGroup();

  const today = todayIso();

  const [name, setName] = useState('');
  const [costText, setCostText] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [nextChargeDate, setNextChargeDate] = useState<string>(addMonths(today, 1));
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const costCents = parseAmountInput(costText) ?? 0;
  const includedIds = members.map((m) => m.id).filter((id) => !excluded.has(id));

  const shares = useMemo(() => evenSplit(costCents, includedIds), [costCents, includedIds.join(',')]);

  // Guess a category from the plan name until the user picks one.
  useEffect(() => {
    if (categoryTouched) return;
    setCategory(detectCategory(name));
  }, [name, categoryTouched]);

  const dateOptions = useMemo(
    () => [
      { label: 'Today', value: today },
      { label: 'In a week', value: addDays(today, 7) },
      { label: 'Next month', value: addMonths(today, 1) },
    ],
    [today]
  );

  const canSave = Boolean(name.trim()) && costCents > 0 && includedIds.length > 0 && Boolean(paidBy);

  const submit = async () => {
    if (!canSave || !paidBy || saving) return;

    setSaving(true);
    setError(null);

    try {
      await addSubscription({
        groupId,
        name,
        monthlyCostCents: costCents,
        paidBy,
        nextChargeDate,
        memberIds: includedIds,
        category,
      });
      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
      setSaving(false);
    }
  };

  if (loading && members.length === 0) return <Loading label="Loading group" />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={60}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorBanner message={error} /> : null}

        <Field
          label="Plan name"
          value={name}
          onChangeText={setName}
          placeholder="Netflix"
          autoFocus
          maxLength={80}
        />

        <View style={styles.chipRow}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.name}
              onPress={() => {
                setName(preset.name);
                setCostText(preset.cost);
              }}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>{preset.name}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Category" />
        <CategoryPicker
          value={category}
          onChange={(next) => {
            setCategoryTouched(true);
            setCategory(next);
          }}
        />

        <Field
          label="Monthly cost"
          value={costText}
          onChangeText={setCostText}
          placeholder="15.49"
          keyboardType="decimal-pad"
          inputStyle={styles.costInput}
        />

        <SectionHeader title="Paid by" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
          {members.map((member) => {
            const selected = member.id === paidBy;
            return (
              <Pressable
                key={member.id}
                onPress={() => setPaidBy(member.id)}
                style={[styles.payer, selected && styles.payerSelected]}
              >
                <Avatar name={member.name} id={member.id} size={40} />
                <Text style={[styles.payerName, selected && styles.payerNameSelected]} numberOfLines={1}>
                  {member.id === userId ? 'You' : member.name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <SectionHeader title="First charge" />
        <View style={styles.chipRow}>
          {dateOptions.map((option) => (
            <Pressable
              key={option.label}
              onPress={() => setNextChargeDate(option.value)}
              style={[styles.dateChip, nextChargeDate === option.value && styles.dateChipActive]}
            >
              <Text
                style={[
                  styles.dateChipText,
                  nextChargeDate === option.value && styles.dateChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.dateHint}>
          {nextChargeDate} · {describeNextCharge(nextChargeDate, today)}, then monthly
        </Text>

        <SectionHeader title={`Split ${includedIds.length} ways`} />
        <Card style={styles.splitCard}>
          {members.map((member, index) => {
            const included = !excluded.has(member.id);
            const share = shares.find((s) => s.userId === member.id);

            return (
              <Pressable
                key={member.id}
                onPress={() =>
                  setExcluded((previous) => {
                    const next = new Set(previous);
                    if (next.has(member.id)) next.delete(member.id);
                    else next.add(member.id);
                    return next;
                  })
                }
                style={[styles.splitRow, index > 0 && styles.splitRowBordered]}
              >
                <Ionicons
                  name={included ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={included ? colors.primary : colors.textFaint}
                />
                <Avatar name={member.name} id={member.id} size={30} />
                <Text style={[styles.splitName, !included && styles.splitNameOff]} numberOfLines={1}>
                  {member.id === userId ? 'You' : member.name}
                </Text>
                <Text style={[styles.splitAmount, !included && styles.splitNameOff]}>
                  {included ? `${formatMoney(share?.shareCents ?? 0)}/mo` : '—'}
                </Text>
              </Pressable>
            );
          })}
        </Card>

        <Button
          title="Add subscription"
          onPress={submit}
          loading={saving}
          disabled={!canSave}
          style={styles.save}
        />

        <Text style={styles.footnote}>
          On each charge date RoomLedger logs an expense for {name.trim() || 'this plan'} and moves the
          date forward a month. Nobody has to remember.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },

  costInput: { fontSize: 26, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.body, fontSize: 14 },

  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  dateChipText: { ...typography.body, fontSize: 14 },
  dateChipTextActive: { color: colors.primary, fontWeight: '700' },
  dateHint: { ...typography.caption },

  payerRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  payer: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 76,
  },
  payerSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  payerName: { ...typography.caption, color: colors.textMuted },
  payerNameSelected: { color: colors.primary, fontWeight: '700' },

  splitCard: { padding: 0, overflow: 'hidden' },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  splitRowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  splitName: { ...typography.body, flex: 1 },
  splitNameOff: { color: colors.textFaint },
  splitAmount: { ...typography.money, fontSize: 14 },

  save: { marginTop: spacing.sm },
  footnote: { ...typography.caption, textAlign: 'center', lineHeight: 17 },
});
