import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmountKeypad } from '../../../src/components/AmountKeypad';
import { CategoryPicker } from '../../../src/components/CategoryPicker';
import { choose, notify } from '../../../src/components/dialog';
import { commitFeedback, successFeedback } from '../../../src/components/haptics';
import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  Field,
  Loading,
  Segmented,
  Tappable,
} from '../../../src/components/ui';
import { applyKey, displayAmount } from '../../../src/core/amountInput';
import { CategoryId, detectCategory, getCategory } from '../../../src/core/categories';
import { formatMoney, parseAmountInput } from '../../../src/core/money';
import {
  SplitLine,
  SplitMode,
  SplitParticipant,
  assignRemainderTo,
  computeSplits,
  remainderCents,
  seedCustomShares,
} from '../../../src/core/splits';
import { useAuth } from '../../../src/data/auth';
import { GroupProvider, useGroup } from '../../../src/data/groupContext';
import { addExpense } from '../../../src/data/mutations';
import { uploadReceipt } from '../../../src/data/storage';
import { friendlyError } from '../../../src/lib/supabase';
import { isOcrEnabled, parseReceipt } from '../../../src/ocr/parseReceipt';
import { colors, fonts, radius, shadowLifted, spacing, typography } from '../../../src/theme';

export default function NewExpenseRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  if (!groupId) return <ErrorBanner message="Missing group." />;
  return (
    <GroupProvider groupId={groupId}>
      <NewExpenseScreen />
    </GroupProvider>
  );
}

type PayMode = 'one' | 'separately';

type EditTarget = { kind: 'total' } | { kind: 'member'; userId: string };

function NewExpenseScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, members, loading } = useGroup();
  const [payMode, setPayMode] = useState<PayMode>('one');
  const [paidBy, setPaidBy] = useState<string | null>(userId);
  const [participants, setParticipants] = useState<SplitParticipant[] | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('even');
  const [sharesTouched, setSharesTouched] = useState(false);
  const [amountRaw, setAmountRaw] = useState('');
  const [ownCents, setOwnCents] = useState<Record<string, number>>({});
  const [memberRaw, setMemberRaw] = useState('');
  const [editing, setEditing] = useState<EditTarget>({ kind: 'total' });
  const [editingPristine, setEditingPristine] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const separately = payMode === 'separately';
  const ownList = members
    .map((m) => ({ userId: m.id, paidCents: Math.round(ownCents[m.id] ?? 0) }))
    .filter((p) => p.paidCents > 0);

  const separateTotal = ownList.reduce((sum, p) => sum + p.paidCents, 0);
  const amountCents = separately ? separateTotal : (parseAmountInput(amountRaw) ?? 0);
  const effectiveParticipants = useMemo<SplitParticipant[]>(
    () => participants ?? members.map((member) => ({ userId: member.id, included: true })),
    [participants, members]
  );

  const split = useMemo(
    () => computeSplits(amountCents, effectiveParticipants, splitMode),
    [amountCents, effectiveParticipants, splitMode]
  );

  const includedMembers = members.filter(
    (member) => effectiveParticipants.find((p) => p.userId === member.id)?.included
  );

  const remaining = splitMode === 'custom' ? remainderCents(amountCents, effectiveParticipants) : 0;
  const perPersonCents =
    includedMembers.length > 0 ? Math.round(amountCents / includedMembers.length) : 0;
  const separateSplits: SplitLine[] = ownList.map((p) => ({
    userId: p.userId,
    shareCents: p.paidCents,
  }));

  useEffect(() => {
    if (categoryTouched) return;
    setCategory(detectCategory(description));
  }, [description, categoryTouched]);

  useEffect(() => {
    if (paidBy === null && userId) setPaidBy(userId);
  }, [userId, paidBy]);

  useEffect(() => {
    if (separately || splitMode !== 'custom' || sharesTouched) return;
    setParticipants((current) =>
      seedCustomShares(amountCents, current ?? members.map((m) => ({ userId: m.id, included: true })))
    );
  }, [amountCents, splitMode, sharesTouched, members, separately]);

  const editingRaw = editing.kind === 'total' ? amountRaw : memberRaw;
  const currentCentsFor = (memberId: string) =>
    separately
      ? Math.round(ownCents[memberId] ?? 0)
      : Math.round(effectiveParticipants.find((p) => p.userId === memberId)?.customCents ?? 0);

  const selectForEditing = (target: EditTarget) => {
    setEditing(target);
    if (target.kind === 'member') {
      setMemberRaw(centsToRaw(currentCentsFor(target.userId)));
      setEditingPristine(true);
    } else {
      setEditingPristine(false);
    }
  };

  const handleKey = (key: string) => {
    const next =
      key === 'clear' ? '' : applyKey(editingPristine && key !== 'delete' ? '' : editingRaw, key);
    setEditingPristine(false);
    if (editing.kind === 'total') {
      setAmountRaw(next);
      return;
    }

    setMemberRaw(next);
    const cents = parseAmountInput(next) ?? 0;
    if (separately) {
      setOwnCents((current) => ({ ...current, [editing.userId]: cents }));
      return;
    }

    setSharesTouched(true);
    setParticipants(
      effectiveParticipants.map((p) =>
        p.userId === editing.userId ? { ...p, customCents: cents } : p
      )
    );
  };

  const switchPayMode = (next: PayMode) => {
    if (next === payMode) return;
    setPayMode(next);
    if (next === 'separately') {
      const seed = parseAmountInput(amountRaw) ?? 0;
      const first = paidBy ?? members[0]?.id;
      setOwnCents(seed > 0 && first ? { [first]: seed } : {});
      if (first) {
        setEditing({ kind: 'member', userId: first });
        setMemberRaw(seed > 0 ? centsToRaw(seed) : '');
        setEditingPristine(seed > 0);
      }
    } else {
      setAmountRaw(separateTotal > 0 ? centsToRaw(separateTotal) : '');
      setOwnCents({});
      setEditing({ kind: 'total' });
      setEditingPristine(false);
      setSharesTouched(false);
      setParticipants(null);
      setSplitMode('even');
    }
  };

  const toggleMember = (memberId: string) => {
    const next = effectiveParticipants.map((p) =>
      p.userId === memberId ? { ...p, included: !p.included } : p
    );
    setParticipants(
      splitMode === 'custom' && !sharesTouched ? seedCustomShares(amountCents, next) : next
    );

    if (editing.kind === 'member' && editing.userId === memberId) {
      selectForEditing({ kind: 'total' });
    }
  };

  const switchSplitMode = (next: SplitMode) => {
    if (next === splitMode) return;
    if (next === 'custom') setParticipants(seedCustomShares(amountCents, effectiveParticipants));
    selectForEditing({ kind: 'total' });
    setSplitMode(next);
  };

  const giveRestTo = (memberId: string) => {
    setSharesTouched(true);
    const next = assignRemainderTo(amountCents, effectiveParticipants, memberId);
    setParticipants(next);
    setMemberRaw(centsToRaw(next.find((p) => p.userId === memberId)?.customCents ?? 0));
    setEditingPristine(true);
  };

  const evenOut = () => {
    setSharesTouched(false);
    const next = seedCustomShares(amountCents, effectiveParticipants);
    setParticipants(next);
    if (editing.kind === 'member') {
      setMemberRaw(centsToRaw(next.find((p) => p.userId === editing.userId)?.customCents ?? 0));
      setEditingPristine(true);
    }
  };

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
        if (parsed.amountCents && !separately && amountRaw === '') {
          selectForEditing({ kind: 'total' });
          setAmountRaw((parsed.amountCents / 100).toFixed(2));
        }
        if (parsed.merchant && !description) setDescription(parsed.merchant);
        setScanNote(
          parsed.amountCents
            ? parsed.confidence >= 0.7
              ? 'Scanned — check the amount before saving.'
              : 'Scanned, but the total was a guess. Please double-check it.'
            : "Couldn't find a total. Type the amount instead."
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

  const canSave = separately
    ? separateTotal > 0 && !saving
    : split.valid && Boolean(paidBy) && !saving;

  const blockedReason = canSave
    ? null
    : separately
      ? 'Enter what at least one person paid.'
      : includedMembers.length === 0
        ? 'Pick at least one person to split with.'
        : amountCents <= 0
          ? 'Enter an amount to save.'
          : !paidBy
            ? 'Choose who paid.'
            : (split.error ?? null);

  const submit = async () => {
    if (!canSave || !userId) return;
    const primaryPayer = separately
      ? ([...ownList].sort((a, b) => b.paidCents - a.paidCents)[0]?.userId ?? userId)
      : paidBy;

    if (!primaryPayer) return;
    commitFeedback();
    setSaving(true);
    setError(null);
    try {
      const receiptPath = receiptUri ? await uploadReceipt(groupId, receiptUri) : null;
      await addExpense({
        groupId,
        paidBy: primaryPayer,
        createdBy: userId,
        description: description.trim() || getCategory(category).label,
        amountCents,
        splits: separately ? separateSplits : split.lines,
        receiptPath,
        category,
        payers: separately && ownList.length > 1 ? ownList : null,
        repeatMonthly,
      });

      successFeedback();
      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
      setSaving(false);
    }
  };

  if (loading && members.length === 0) return <Loading label="Loading group" />;
  const editingMember =
    editing.kind === 'member' ? members.find((m) => m.id === editing.userId) : undefined;
  const amountLabel =
    editing.kind === 'total'
      ? 'TOTAL'
      : separately
        ? `${editingMember?.id === userId ? 'YOU' : (editingMember?.name ?? 'THEY').toUpperCase()} PAID`
        : `${editingMember?.id === userId ? 'YOUR' : `${(editingMember?.name ?? 'THEIR').toUpperCase()}’S`} SHARE`;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={20}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error ? <ErrorBanner message={error} /> : null}

          {/* ============================================== 1. WHO PAID = */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Who paid</Text>
            <Segmented
              options={[
                { label: 'One', value: 'one' },
                { label: 'Separately', value: 'separately' },
              ]}
              value={payMode}
              onChange={(next) => switchPayMode(next as PayMode)}
              style={styles.headToggle}
            />
          </View>

          {separately ? (
            <>
              <Card padded={false} style={styles.rowCard}>
                {members.map((member, index) => {
                  const cents = Math.round(ownCents[member.id] ?? 0);
                  const active = editing.kind === 'member' && editing.userId === member.id;
                  return (
                    <Pressable
                      key={member.id}
                      onPress={() => selectForEditing({ kind: 'member', userId: member.id })}
                      style={[styles.personRow, index > 0 && styles.rowBordered]}
                      accessibilityLabel={`Set what ${member.name} paid`}
                    >
                      <Avatar name={member.name} id={member.id} size={30} />
                      <Text style={styles.personName} numberOfLines={1}>
                        {member.id === userId ? 'You' : member.name}
                      </Text>
                      <View style={[styles.amountBox, active && styles.amountBoxActive]}>
                        <Text style={[styles.amountBoxText, cents === 0 && styles.amountBoxEmpty]}>
                          {formatMoney(cents)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </Card>

              <Text style={styles.hint}>
                Everyone covered their own — nobody ends up owing anybody.
              </Text>
            </>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.payerRow}
            >
              {members.map((member) => {
                const selected = member.id === paidBy;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setPaidBy(member.id)}
                    style={[styles.payerPick, selected && styles.payerPickOn]}
                  >
                    <Avatar name={member.name} id={member.id} size={38} />
                    <Text
                      style={[styles.payerName, selected && styles.payerNameOn]}
                      numberOfLines={1}
                    >
                      {member.id === userId ? 'You' : member.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {!separately ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Split between</Text>
                <Segmented
                  options={[
                    { label: 'Even', value: 'even' },
                    { label: 'Custom', value: 'custom' },
                  ]}
                  value={splitMode}
                  onChange={switchSplitMode}
                  style={styles.headToggle}
                />
              </View>

              <Card padded={false} style={styles.rowCard}>
                {members.map((member, index) => {
                  const included =
                    effectiveParticipants.find((p) => p.userId === member.id)?.included ?? false;
                  const line = split.lines.find((l) => l.userId === member.id);
                  const active = editing.kind === 'member' && editing.userId === member.id;
                  return (
                    <View key={member.id} style={[styles.personRow, index > 0 && styles.rowBordered]}>
                      <Pressable
                        onPress={() => toggleMember(member.id)}
                        style={styles.personToggle}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: included }}
                      >
                        <Ionicons
                          name={included ? 'checkmark-circle' : 'ellipse-outline'}
                          size={23}
                          color={included ? colors.primary : colors.textFaint}
                        />
                        <Avatar name={member.name} id={member.id} size={30} />
                        <Text
                          style={[styles.personName, !included && styles.personNameOff]}
                          numberOfLines={1}
                        >
                          {member.id === userId ? 'You' : member.name}
                        </Text>
                      </Pressable>

                      {included && splitMode === 'custom' ? (
                        <Pressable
                          onPress={() => selectForEditing({ kind: 'member', userId: member.id })}
                          style={[styles.amountBox, active && styles.amountBoxActive]}
                          accessibilityLabel={`Edit ${member.name}'s share`}
                        >
                          <Text style={styles.amountBoxText}>
                            {formatMoney(currentCentsFor(member.id))}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={[styles.shareText, !included && styles.personNameOff]}>
                          {included ? formatMoney(line?.shareCents ?? 0) : '—'}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </Card>

              {splitMode === 'custom' && amountCents > 0 ? (
                <View style={styles.hintRow}>
                  <Text style={[styles.hint, remaining === 0 ? styles.hintOk : styles.hintWarn]}>
                    {remaining === 0
                      ? 'Shares add up exactly'
                      : remaining > 0
                        ? `${formatMoney(remaining)} still to assign`
                        : `${formatMoney(-remaining)} over the total`}
                  </Text>
                  {remaining !== 0 && editing.kind === 'member' ? (
                    <Button
                      title="Give rest"
                      variant="subtle"
                      size="sm"
                      onPress={() => giveRestTo((editing as { userId: string }).userId)}
                    />
                  ) : null}
                  {remaining !== 0 ? (
                    <Button title="Even out" variant="subtle" size="sm" onPress={evenOut} />
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          <View style={styles.divider} />

          <Text style={[styles.amountLabel, editing.kind !== 'total' && styles.amountLabelAlt]}>
            {amountLabel}
          </Text>

          <View style={styles.amountBlock}>
            <Text style={[styles.currency, editing.kind !== 'total' && styles.currencyAlt]}>$</Text>
            <Text
              style={[styles.amount, editing.kind !== 'total' && styles.amountAlt]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displayAmount(editingRaw)}
            </Text>
          </View>

          {separately ? (
            <Text style={styles.perPerson}>
              {separateTotal > 0
                ? `Total ${formatMoney(separateTotal)} · nobody owes anyone`
                : 'Tap a name, then type what they paid'}
            </Text>
          ) : editing.kind !== 'total' ? (
            <Pressable onPress={() => selectForEditing({ kind: 'total' })} style={styles.backToTotal}>
              <Ionicons name="arrow-back-circle-outline" size={15} color={colors.primary} />
              <Text style={styles.backToTotalText}>
                of {formatMoney(amountCents)} total — tap to edit the total
              </Text>
            </Pressable>
          ) : amountCents > 0 && includedMembers.length > 0 ? (
            <Text style={styles.perPerson}>
              {formatMoney(perPersonCents)} each · {includedMembers.length}{' '}
              {includedMembers.length === 1 ? 'person' : 'people'}
            </Text>
          ) : (
            <Text style={styles.perPerson}>Tap in the amount</Text>
          )}

          <AmountKeypad onKey={handleKey} disabled={saving} />

          {/* ============================================== 4. DETAILS == */}
          <View style={styles.divider} />

          <Field
            value={description}
            onChangeText={setDescription}
            placeholder="What was it for? (optional)"
            maxLength={140}
            autoCapitalize="sentences"
            icon="pricetag-outline"
          />

          <CategoryPicker
            value={category}
            onChange={(next) => {
              setCategoryTouched(true);
              setCategory(next);
            }}
          />

          <Tappable
            onPress={() => setRepeatMonthly((on) => !on)}
            style={[styles.optionRow, repeatMonthly && styles.optionRowOn]}
            scaleTo={0.99}
          >
            <Ionicons
              name={repeatMonthly ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={repeatMonthly ? colors.primary : colors.textFaint}
            />
            <View style={styles.optionBody}>
              <Text style={[styles.optionTitle, repeatMonthly && styles.optionTitleOn]}>
                Repeats monthly
              </Text>
              <Text style={styles.hint}>
                {repeatMonthly
                  ? 'Posts itself every month with the same split.'
                  : 'For rent, utilities — anything that comes back.'}
              </Text>
            </View>
            <Ionicons name="repeat" size={18} color={repeatMonthly ? colors.primary : colors.textFaint} />
          </Tappable>

          {receiptUri ? (
            <Card style={styles.receiptCard}>
              <Image source={{ uri: receiptUri }} style={styles.receiptImage} />
              <View style={styles.receiptBody}>
                <Text style={styles.optionTitle}>Receipt attached</Text>
                {scanning ? (
                  <View style={styles.scanning}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.hint}>Reading receipt…</Text>
                  </View>
                ) : scanNote ? (
                  <Text style={styles.hint}>{scanNote}</Text>
                ) : null}
                <Pressable onPress={() => setReceiptUri(null)} hitSlop={6}>
                  <Text style={styles.removeLink}>Remove</Text>
                </Pressable>
              </View>
            </Card>
          ) : (
            <Tappable onPress={() => void offerReceipt()} style={styles.receiptEmpty}>
              <Ionicons name="camera-outline" size={19} color={colors.primary} />
              <Text style={styles.receiptCta}>
                {isOcrEnabled() ? 'Scan a receipt to fill this in' : 'Attach a receipt photo'}
              </Text>
            </Tappable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {blockedReason ? <Text style={styles.blocked}>{blockedReason}</Text> : null}
          <Button
            title={canSave && amountCents > 0 ? `Save ${formatMoney(amountCents)}` : 'Save expense'}
            onPress={submit}
            loading={saving}
            disabled={!canSave}
            icon="checkmark"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function centsToRaw(cents: number): string {
  if (!cents) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 34,
  },
  sectionTitle: { ...typography.label },
  headToggle: { width: 184 },
  rowCard: { overflow: 'hidden' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  rowBordered: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  personToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  personName: { ...typography.body, flex: 1 },
  personNameOff: { color: colors.textFaint },
  shareText: { ...typography.money, fontSize: 15 },
  amountBox: {
    minWidth: 92,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'flex-end',
  },
  amountBoxActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  amountBoxText: { ...typography.money, fontSize: 15 },
  amountBoxEmpty: { color: colors.textFaint },
  payerRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  payerPick: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 74,
  },
  payerPickOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  payerName: { ...typography.caption, color: colors.textMuted },
  payerNameOn: { color: colors.primary, fontFamily: fonts.bold },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  hint: { ...typography.caption, flexShrink: 1, lineHeight: 16 },
  hintOk: { color: colors.positive, fontFamily: fonts.bold },
  hintWarn: { color: colors.warning, fontFamily: fonts.bold },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  amountLabel: { ...typography.label, textAlign: 'center' },
  amountLabelAlt: { color: colors.primary },
  amountBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 4,
    marginTop: -spacing.xs,
  },
  currency: { ...typography.title, fontSize: 24, color: colors.textMuted, marginTop: 9 },
  currencyAlt: { color: colors.primary },
  amount: { ...typography.hero, fontSize: 50, lineHeight: 58 },
  amountAlt: { color: colors.primary },
  perPerson: { ...typography.caption, textAlign: 'center' },
  backToTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  backToTotalText: { ...typography.caption, color: colors.primary, fontFamily: fonts.bold },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionRowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionBody: { flex: 1, gap: 2 },
  optionTitle: { ...typography.bodyStrong, fontSize: 14.5 },
  optionTitleOn: { color: colors.primary },
  receiptCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  receiptImage: { width: 52, height: 66, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  receiptBody: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeLink: { ...typography.caption, color: colors.negative, fontFamily: fonts.bold },
  receiptEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  receiptCta: { ...typography.bodyStrong, color: colors.primary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadowLifted,
  },
  blocked: {
    ...typography.caption,
    color: colors.negative,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
