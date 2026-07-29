import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { choose, notify } from '../../../src/components/dialog';
import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  Field,
  Loading,
  SectionHeader,
} from '../../../src/components/ui';
import { formatMoney, parseAmountInput } from '../../../src/core/money';
import { SplitMode, SplitParticipant, computeSplits, seedCustomShares } from '../../../src/core/splits';
import { useAuth } from '../../../src/data/auth';
import { GroupProvider, useGroup } from '../../../src/data/groupContext';
import { addExpense } from '../../../src/data/mutations';
import { uploadReceipt } from '../../../src/data/storage';
import { friendlyError } from '../../../src/lib/supabase';
import { isOcrEnabled, parseReceipt } from '../../../src/ocr/parseReceipt';
import { colors, radius, spacing, typography } from '../../../src/theme';

const QUICK_DESCRIPTIONS = ['Groceries', 'Dinner', 'Uber', 'Supplies', 'Utilities'];

export default function NewExpenseRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  if (!groupId) {
    return <ErrorBanner message="Missing group." />;
  }

  return (
    <GroupProvider groupId={groupId}>
      <NewExpenseScreen />
    </GroupProvider>
  );
}

function NewExpenseScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, members, loading } = useGroup();

  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [participants, setParticipants] = useState<SplitParticipant[] | null>(null);
  const [mode, setMode] = useState<SplitMode>('even');
  const [customText, setCustomText] = useState<Record<string, string>>({});

  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Default: everyone in, split evenly. Most expenses need no further taps.
  const effectiveParticipants = useMemo<SplitParticipant[]>(
    () => participants ?? members.map((member) => ({ userId: member.id, included: true })),
    [participants, members]
  );

  const amountCents = parseAmountInput(amountText) ?? 0;

  const split = useMemo(
    () => computeSplits(amountCents, effectiveParticipants, mode),
    [amountCents, effectiveParticipants, mode]
  );

  const includedCount = effectiveParticipants.filter((p) => p.included).length;

  const toggleMember = (memberId: string) => {
    setParticipants(
      effectiveParticipants.map((p) => (p.userId === memberId ? { ...p, included: !p.included } : p))
    );
  };

  const switchMode = (next: SplitMode) => {
    if (next === mode) return;

    if (next === 'custom') {
      // Seed the boxes from the even split so the form starts valid.
      const seeded = seedCustomShares(amountCents, effectiveParticipants);
      setParticipants(seeded);
      setCustomText(
        Object.fromEntries(
          seeded.map((p) => [p.userId, p.included ? ((p.customCents ?? 0) / 100).toFixed(2) : ''])
        )
      );
    }

    setMode(next);
  };

  const setCustomAmount = (memberId: string, text: string) => {
    setCustomText((previous) => ({ ...previous, [memberId]: text }));
    setParticipants(
      effectiveParticipants.map((p) =>
        p.userId === memberId ? { ...p, customCents: parseAmountInput(text) ?? 0 } : p
      )
    );
  };

  /* ------------------------------------------------------------ receipt -- */

  const pickImage = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      await notify({
        title: 'Permission needed',
        message:
          source === 'camera'
            ? 'Allow camera access to scan receipts.'
            : 'Allow photo access to attach a receipt.',
      });
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.6,
      // Only request base64 when something will actually read it.
      base64: isOcrEnabled(),
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setReceiptUri(asset.uri);
    setScanNote(null);

    if (!isOcrEnabled()) return;

    setScanning(true);
    try {
      const parsed = await parseReceipt({ uri: asset.uri, base64: asset.base64 });

      if (parsed.error) {
        setScanNote(parsed.error);
      } else {
        // Suggestions only — both fields stay editable before saving.
        if (parsed.amountCents && !amountText) {
          setAmountText((parsed.amountCents / 100).toFixed(2));
        }
        if (parsed.merchant && !description) {
          setDescription(parsed.merchant);
        }

        setScanNote(
          parsed.amountCents
            ? parsed.confidence >= 0.7
              ? 'Scanned — check the amount before saving.'
              : 'Scanned, but the total was a guess. Please double-check it.'
            : "Couldn't find a total. Enter the amount by hand."
        );
      }
    } finally {
      setScanning(false);
    }
  };

  const offerReceipt = async () => {
    const source = await choose({
      title: isOcrEnabled() ? 'Scan a receipt' : 'Attach a receipt',
      options: [
        { label: 'Take photo', value: 'camera' },
        { label: 'Choose from library', value: 'library' },
      ],
    });

    if (source === 'camera' || source === 'library') await pickImage(source);
  };

  /* --------------------------------------------------------------- save -- */

  const canSave = split.valid && Boolean(description.trim()) && Boolean(paidBy) && !saving;

  const submit = async () => {
    if (!canSave || !paidBy || !userId) return;

    setSaving(true);
    setError(null);

    try {
      // Upload only once the expense is definitely being saved, so a
      // cancelled form never leaves an orphaned object in storage.
      const receiptPath = receiptUri ? await uploadReceipt(groupId, receiptUri) : null;

      await addExpense({
        groupId,
        paidBy,
        createdBy: userId,
        description,
        amountCents,
        splits: split.lines,
        receiptPath,
      });

      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
      setSaving(false);
    }
  };

  if (loading && members.length === 0) {
    return <Loading label="Loading group" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={60}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorBanner message={error} /> : null}

        <Field
          label="Amount"
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0.00"
          keyboardType="decimal-pad"
          autoFocus
          inputStyle={styles.amountInput}
        />

        <Field
          label="What was it for?"
          value={description}
          onChangeText={setDescription}
          placeholder="Groceries"
          maxLength={140}
          autoCapitalize="sentences"
        />

        <View style={styles.chipRow}>
          {QUICK_DESCRIPTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => setDescription(suggestion)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>

        {/* ------------------------------------------------------ receipt -- */}

        <Card style={styles.receiptCard}>
          {receiptUri ? (
            <View style={styles.receiptPreview}>
              <Image source={{ uri: receiptUri }} style={styles.receiptImage} />
              <View style={styles.receiptBody}>
                <Text style={styles.receiptTitle}>Receipt attached</Text>
                {scanning ? (
                  <View style={styles.scanning}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.receiptNote}>Reading receipt…</Text>
                  </View>
                ) : scanNote ? (
                  <Text style={styles.receiptNote}>{scanNote}</Text>
                ) : null}
                <Pressable onPress={() => setReceiptUri(null)} hitSlop={6}>
                  <Text style={styles.removeLink}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => void offerReceipt()} style={styles.receiptEmpty}>
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
              <Text style={styles.receiptCta}>
                {isOcrEnabled() ? 'Scan a receipt to fill this in' : 'Attach a receipt photo'}
              </Text>
            </Pressable>
          )}
        </Card>

        {/* -------------------------------------------------------- payer -- */}

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

        {/* -------------------------------------------------------- split -- */}

        <SectionHeader
          title={`Split ${includedCount} ${includedCount === 1 ? 'way' : 'ways'}`}
          action={
            <View style={styles.modeToggle}>
              {(['even', 'custom'] as SplitMode[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => switchMode(option)}
                  style={[styles.modeButton, mode === option && styles.modeButtonActive]}
                >
                  <Text style={[styles.modeText, mode === option && styles.modeTextActive]}>
                    {option === 'even' ? 'Even' : 'Custom'}
                  </Text>
                </Pressable>
              ))}
            </View>
          }
        />

        <Card style={styles.splitCard}>
          {members.map((member, index) => {
            const participant = effectiveParticipants.find((p) => p.userId === member.id);
            const included = participant?.included ?? false;
            const line = split.lines.find((l) => l.userId === member.id);

            return (
              <View
                key={member.id}
                style={[styles.splitRow, index > 0 && styles.splitRowBordered]}
              >
                <Pressable
                  onPress={() => toggleMember(member.id)}
                  style={styles.splitToggle}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: included }}
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
                </Pressable>

                {included && mode === 'custom' ? (
                  <Field
                    value={customText[member.id] ?? ''}
                    onChangeText={(text) => setCustomAmount(member.id, text)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    style={styles.customField}
                    inputStyle={styles.customInput}
                  />
                ) : (
                  <Text style={[styles.splitAmount, !included && styles.splitNameOff]}>
                    {included ? formatMoney(line?.shareCents ?? 0) : '—'}
                  </Text>
                )}
              </View>
            );
          })}
        </Card>

        {split.error ? (
          <View style={styles.splitStatusBad}>
            <Ionicons name="alert-circle" size={16} color={colors.negative} />
            <Text style={styles.splitStatusBadText}>{split.error}</Text>
          </View>
        ) : amountCents > 0 ? (
          <View style={styles.splitStatusGood}>
            <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
            <Text style={styles.splitStatusGoodText}>
              Shares add up to {formatMoney(amountCents)}
            </Text>
          </View>
        ) : null}

        <Button
          title={saving ? 'Saving…' : `Save ${amountCents > 0 ? formatMoney(amountCents) : 'expense'}`}
          onPress={submit}
          loading={saving}
          disabled={!canSave}
          style={styles.save}
        />

        {receiptUri ? (
          <Text style={styles.privacyNote}>
            The receipt is uploaded to your group's private storage — only members can open it.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },

  amountInput: { fontSize: 32, fontWeight: '700', minHeight: 64 },

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

  receiptCard: { padding: spacing.md },
  receiptEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  receiptCta: { ...typography.body, color: colors.primary, fontWeight: '600' },
  receiptPreview: { flexDirection: 'row', gap: spacing.md },
  receiptImage: { width: 56, height: 72, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  receiptBody: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  receiptTitle: { ...typography.body, fontWeight: '600' },
  receiptNote: { ...typography.caption, lineHeight: 16 },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeLink: { ...typography.caption, color: colors.negative, fontWeight: '600' },

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

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 2,
  },
  modeButton: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  modeButtonActive: { backgroundColor: colors.surface },
  modeText: { ...typography.caption, fontWeight: '600' },
  modeTextActive: { color: colors.text },

  splitCard: { padding: 0, overflow: 'hidden' },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
    gap: spacing.sm,
  },
  splitRowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  splitToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  splitName: { ...typography.body, flexShrink: 1 },
  splitNameOff: { color: colors.textFaint },
  splitAmount: { ...typography.money },
  customField: { width: 104 },
  customInput: { textAlign: 'right', minHeight: 40, paddingVertical: spacing.sm, fontSize: 15 },

  splitStatusBad: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  splitStatusBadText: { ...typography.caption, color: colors.negative, flex: 1 },
  splitStatusGood: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  splitStatusGoodText: { ...typography.caption, color: colors.positive, flex: 1 },

  save: { marginTop: spacing.sm },
  privacyNote: { ...typography.caption, textAlign: 'center' },
});
