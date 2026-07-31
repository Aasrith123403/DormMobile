import { Ionicons } from '@expo/vector-icons';
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
  AvatarStack,
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
import { colors, radius, shadowLifted, spacing, typography } from '../../../src/theme';

export default function NewExpenseRoute() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  if (!groupId) return <ErrorBanner message="Missing group." />;

  return (
    <GroupProvider groupId={groupId}>
      <NewExpenseScreen />
    </GroupProvider>
  );
}

/**
 * Logging an expense is the app's hot path, so the whole thing lives on one
 * screen with no system keyboard: type the amount on the pad, tap a
 * category, save. Payer and split default to "you paid, everyone splits
 * evenly" and stay collapsed behind a one-line summary — the common case
 * needs no interaction with them at all.
 */
function NewExpenseScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, members, loading } = useGroup();

  const [amountRaw, setAmountRaw] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(null);
  /** Set once the user picks a category by hand, so guesses stop overriding. */
  const [categoryTouched, setCategoryTouched] = useState(false);

  const [paidBy, setPaidBy] = useState<string | null>(userId);
  /**
   * Who put money in. One payer is the overwhelmingly common case and stays
   * a single tap; `payerCents` only comes into play once "Split the bill" is
   * turned on, and then it must add up to the total exactly.
   */
  const [multiPayer, setMultiPayer] = useState(false);
  const [payerCents, setPayerCents] = useState<Record<string, number>>({});
  const [participants, setParticipants] = useState<SplitParticipant[] | null>(null);
  const [mode, setMode] = useState<SplitMode>('even');
  const [splitOpen, setSplitOpen] = useState(false);
  /**
   * What the keypad is editing. Custom shares reuse the same pad as the
   * total, so no system keyboard ever covers the row being edited — which is
   * exactly how the old text-field version became unusable on a phone.
   */
  const [editing, setEditing] = useState<
    { kind: 'total' } | { kind: 'member'; userId: string } | { kind: 'payer'; userId: string }
  >({ kind: 'total' });
  const [editingPristine, setEditingPristine] = useState(false);
  /**
   * The digit string for the share being edited. Kept as text, not derived
   * from cents: "15." is a valid thing to have typed so far, and a cents
   * round-trip would drop the decimal point before the next key arrived.
   */
  const [shareRaw, setShareRaw] = useState('');
  const [payerRaw, setPayerRaw] = useState('');
  /**
   * Whether anyone's share has been set by hand. Until then, custom shares
   * follow the total automatically — otherwise switching to Custom and then
   * correcting the amount leaves the shares stranded at the old figure and
   * Save refuses with no obvious cause.
   */
  const [sharesTouched, setSharesTouched] = useState(false);

  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountCents = parseAmountInput(amountRaw) ?? 0;

  // Default: everyone in, split evenly.
  const effectiveParticipants = useMemo<SplitParticipant[]>(
    () => participants ?? members.map((member) => ({ userId: member.id, included: true })),
    [participants, members]
  );

  const split = useMemo(
    () => computeSplits(amountCents, effectiveParticipants, mode),
    [amountCents, effectiveParticipants, mode]
  );

  const includedMembers = members.filter(
    (member) => effectiveParticipants.find((p) => p.userId === member.id)?.included
  );

  // Auto-categorise from whatever the user typed, until they choose one.
  useEffect(() => {
    if (categoryTouched) return;
    const guess = detectCategory(description);
    setCategory(guess);
  }, [description, categoryTouched]);

  useEffect(() => {
    if (paidBy === null && userId) setPaidBy(userId);
  }, [userId, paidBy]);

  const toggleMember = (memberId: string) => {
    const next = effectiveParticipants.map((p) =>
      p.userId === memberId ? { ...p, included: !p.included } : p
    );
    // Re-seed an untouched custom split so removing someone does not leave a
    // gap the user has to close by hand.
    setParticipants(mode === 'custom' && !sharesTouched ? seedCustomShares(amountCents, next) : next);

    if (editing.kind === 'member' && editing.userId === memberId) {
      selectForEditing({ kind: 'total' });
    }
  };

  const switchMode = (next: SplitMode) => {
    if (next === mode) return;

    if (next === 'custom') {
      // Seed from the even split so the form starts valid and already adds
      // up. The keypad deliberately stays on the total: silently handing it
      // to one person means the next thing typed rewrites their share
      // instead of the amount, which is impossible to notice.
      setParticipants(seedCustomShares(amountCents, effectiveParticipants));
    }

    selectForEditing({ kind: 'total' });
    setMode(next);
  };

  /** The digit string the keypad is currently editing. */
  const editingRaw =
    editing.kind === 'total' ? amountRaw : editing.kind === 'payer' ? payerRaw : shareRaw;

  const selectForEditing = (
    target: { kind: 'total' } | { kind: 'member'; userId: string } | { kind: 'payer'; userId: string }
  ) => {
    setEditing(target);

    if (target.kind === 'payer') {
      setPayerRaw(centsToRaw(Math.round(payerCents[target.userId] ?? 0)));
      setEditingPristine(true);
    } else if (target.kind === 'member') {
      setShareRaw(
        centsToRaw(effectiveParticipants.find((p) => p.userId === target.userId)?.customCents ?? 0)
      );
      // Calculator behaviour: the first digit after picking a person replaces
      // their seeded share, so tapping and typing just works.
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

    if (editing.kind === 'payer') {
      setPayerRaw(next);
      setPayerCents((current) => ({ ...current, [editing.userId]: parseAmountInput(next) ?? 0 }));
      return;
    }

    setShareRaw(next);
    setSharesTouched(true);
    const cents = parseAmountInput(next) ?? 0;
    setParticipants(
      effectiveParticipants.map((p) =>
        p.userId === editing.userId ? { ...p, customCents: cents } : p
      )
    );
  };

  // Keep untouched custom shares in step with the total.
  useEffect(() => {
    if (mode !== 'custom' || sharesTouched) return;
    setParticipants((current) =>
      seedCustomShares(amountCents, current ?? members.map((m) => ({ userId: m.id, included: true })))
    );
  }, [amountCents, mode, sharesTouched, members]);

  const giveRestTo = (memberId: string) => {
    setSharesTouched(true);
    const next = assignRemainderTo(amountCents, effectiveParticipants, memberId);
    setParticipants(next);
    // The shortcut rewrites the amount, so resync what the keypad shows.
    setShareRaw(centsToRaw(next.find((p) => p.userId === memberId)?.customCents ?? 0));
    setEditingPristine(true);
  };

  const toggleMultiPayer = (on: boolean) => {
    setMultiPayer(on);
    selectForEditing({ kind: 'total' });

    if (on) {
      // Seed with the single payer covering the whole bill, so the starting
      // state already adds up and only needs adjusting.
      setPayerCents(paidBy ? { [paidBy]: amountCents } : {});
    } else {
      setPayerCents({});
    }
  };

  /** Closes the gap between contributions and the total in one tap. */
  const givePayerRestTo = (memberId: string) => {
    const others = members
      .filter((m) => m.id !== memberId)
      .reduce((sum, m) => sum + Math.round(payerCents[m.id] ?? 0), 0);
    const next = Math.max(0, amountCents - others);

    setPayerCents((current) => ({ ...current, [memberId]: next }));
    setPayerRaw(centsToRaw(next));
    setEditingPristine(true);
  };

  const evenOut = () => {
    setSharesTouched(false);
    const next = seedCustomShares(amountCents, effectiveParticipants);
    setParticipants(next);
    if (editing.kind === 'member') {
      setShareRaw(centsToRaw(next.find((p) => p.userId === editing.userId)?.customCents ?? 0));
      setEditingPristine(true);
    }
  };

  const remaining = mode === 'custom' ? remainderCents(amountCents, effectiveParticipants) : 0;

  const payerList = multiPayer
    ? members
        .map((m) => ({ userId: m.id, paidCents: Math.round(payerCents[m.id] ?? 0) }))
        .filter((p) => p.paidCents > 0)
    : [];
  const payerTotal = payerList.reduce((sum, p) => sum + p.paidCents, 0);
  const payerRemaining = multiPayer ? amountCents - payerTotal : 0;
  const payersValid = !multiPayer || (payerList.length > 1 && payerRemaining === 0);

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
        // Suggestions only — everything stays editable before saving.
        if (parsed.amountCents && amountRaw === '') {
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

  /* --------------------------------------------------------------- save -- */

  const canSave = split.valid && Boolean(paidBy) && payersValid && !saving;

  /** Why Save is unavailable, in words. A dead button with no reason is the
   *  worst possible state to leave someone in. */
  const blockedReason = canSave
    ? null
    : amountCents <= 0
      ? 'Enter an amount to save.'
      : includedMembers.length === 0
        ? 'Pick at least one person to split with.'
        : !paidBy
          ? 'Choose who paid.'
          : multiPayer && payerList.length < 2
            ? 'Enter what at least two people put in, or switch back to one payer.'
            : multiPayer && payerRemaining !== 0
              ? payerRemaining > 0
                ? `Payers are ${formatMoney(payerRemaining)} short of the total.`
                : `Payers are ${formatMoney(-payerRemaining)} over the total.`
              : (split.error ?? null);

  const submit = async () => {
    if (!canSave || !paidBy || !userId) return;

    // `expenses.paid_by` is NOT NULL and is what older readers show, so point
    // it at whoever put in the most.
    const primaryPayer = multiPayer
      ? [...payerList].sort((a, b) => b.paidCents - a.paidCents)[0]?.userId ?? paidBy
      : paidBy;

    commitFeedback();
    setSaving(true);
    setError(null);

    try {
      const receiptPath = receiptUri ? await uploadReceipt(groupId, receiptUri) : null;

      await addExpense({
        groupId,
        paidBy: primaryPayer,
        createdBy: userId,
        // Description is optional now — the category names it if left blank.
        description: description.trim() || getCategory(category).label,
        amountCents,
        splits: split.lines,
        receiptPath,
        category,
        payers: multiPayer ? payerList : null,
      });

      successFeedback();
      router.back();
    } catch (caught) {
      setError(friendlyError(caught));
      setSaving(false);
    }
  };

  if (loading && members.length === 0) return <Loading label="Loading group" />;

  const payer = members.find((m) => m.id === paidBy);
  const perPersonCents =
    includedMembers.length > 0 ? Math.round(amountCents / includedMembers.length) : 0;

  const editingMember =
    editing.kind === 'total' ? undefined : members.find((m) => m.id === editing.userId);

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

          {/* ---------------------------------------------------- amount -- */}
          {/* The pad is shared between the total and individual shares, so
              the label above the number always says which one is live —
              without it, typing silently rewrites the wrong figure. */}
          <Text style={[styles.amountLabel, editing.kind === 'member' && styles.amountLabelShare]}>
            {editing.kind === 'total'
              ? 'TOTAL'
              : `${editingMember?.id === userId ? 'YOUR' : `${(editingMember?.name ?? 'THEIR').toUpperCase()}’S`} ${
                  editing.kind === 'payer' ? 'CONTRIBUTION' : 'SHARE'
                }`}
          </Text>

          <View style={styles.amountBlock}>
            <Text style={[styles.currency, editing.kind === 'member' && styles.currencyShare]}>$</Text>
            <Text
              style={[styles.amount, editing.kind === 'member' && styles.amountShare]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displayAmount(editingRaw)}
            </Text>
          </View>

          {editing.kind === 'member' ? (
            <Pressable onPress={() => selectForEditing({ kind: 'total' })} style={styles.editingBanner}>
              <Ionicons name="arrow-back-circle-outline" size={15} color={colors.primary} />
              <Text style={styles.editingBannerText}>
                of {formatMoney(amountCents)} total — tap to edit the total
              </Text>
            </Pressable>
          ) : amountCents > 0 && includedMembers.length > 0 ? (
            <Text style={styles.perPerson}>
              {mode === 'even'
                ? `${formatMoney(perPersonCents)} each · ${includedMembers.length} ${
                    includedMembers.length === 1 ? 'person' : 'people'
                  }`
                : `Custom split across ${includedMembers.length} ${
                    includedMembers.length === 1 ? 'person' : 'people'
                  }`}
            </Text>
          ) : (
            <Text style={styles.perPerson}>Tap in the amount</Text>
          )}

          <AmountKeypad onKey={handleKey} disabled={saving} />

          {/* ---------------------------------------------------- what for -- */}
          <Field
            value={description}
            onChangeText={setDescription}
            placeholder="What was it for? (optional)"
            maxLength={140}
            autoCapitalize="sentences"
            icon="pricetag-outline"
            style={styles.descriptionField}
          />

          <CategoryPicker
            value={category}
            onChange={(next) => {
              setCategoryTouched(true);
              setCategory(next);
            }}
          />

          {/* ----------------------------------------------------- receipt -- */}
          {receiptUri ? (
            <Card style={styles.receiptCard}>
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
            </Card>
          ) : (
            <Tappable onPress={() => void offerReceipt()} style={styles.receiptEmpty}>
              <Ionicons name="camera-outline" size={19} color={colors.primary} />
              <Text style={styles.receiptCta}>
                {isOcrEnabled() ? 'Scan a receipt to fill this in' : 'Attach a receipt photo'}
              </Text>
            </Tappable>
          )}

          {/* --------------------------------------- payer + split summary -- */}
          <Tappable onPress={() => setSplitOpen((open) => !open)} style={styles.summary} scaleTo={0.99}>
            <Avatar name={payer?.name ?? 'You'} id={paidBy ?? undefined} size={34} />
            <View style={styles.summaryBody}>
              <Text style={styles.summaryTitle}>
                {multiPayer
                  ? `${Math.max(payerList.length, 2)} people paid`
                  : paidBy === userId
                    ? 'You paid'
                    : `${payer?.name ?? 'Someone'} paid`}
              </Text>
              <Text style={styles.summaryMeta}>
                {mode === 'even' ? 'Split evenly' : 'Custom split'} · {includedMembers.length}{' '}
                {includedMembers.length === 1 ? 'person' : 'people'}
              </Text>
            </View>
            <AvatarStack people={includedMembers.map((m) => ({ id: m.id, name: m.name }))} />
            <Ionicons
              name={splitOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textFaint}
            />
          </Tappable>

          {splitOpen ? (
            <View style={styles.details}>
              <View style={styles.splitHeader}>
                <Text style={styles.detailLabel}>Paid by</Text>
                <Segmented
                  options={[
                    { label: 'One person', value: 'one' },
                    { label: 'Several', value: 'several' },
                  ]}
                  value={multiPayer ? 'several' : 'one'}
                  onChange={(next) => toggleMultiPayer(next === 'several')}
                  style={styles.payerToggle}
                />
              </View>

              {multiPayer ? (
                <>
                  <Card padded={false} style={styles.splitCard}>
                    {members.map((member, index) => {
                      const cents = Math.round(payerCents[member.id] ?? 0);
                      const active = editing.kind === 'payer' && editing.userId === member.id;

                      return (
                        <View
                          key={member.id}
                          style={[styles.splitRow, index > 0 && styles.splitRowBordered]}
                        >
                          <View style={styles.splitToggle}>
                            <Avatar name={member.name} id={member.id} size={30} />
                            <Text style={styles.splitName} numberOfLines={1}>
                              {member.id === userId ? 'You' : member.name}
                            </Text>
                          </View>

                          <Pressable
                            onPress={() => selectForEditing({ kind: 'payer', userId: member.id })}
                            style={[styles.shareBox, active && styles.shareBoxActive]}
                            accessibilityLabel={`Set what ${member.name} paid`}
                          >
                            <Text
                              style={[styles.shareBoxText, cents === 0 && styles.shareBoxTextEmpty]}
                            >
                              {formatMoney(cents)}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </Card>

                  <View style={styles.payerHintRow}>
                    <Text
                      style={[
                        styles.payerHint,
                        payerRemaining === 0 && payerList.length > 1
                          ? styles.remainderOk
                          : styles.remainderOff,
                      ]}
                    >
                      {payerRemaining === 0 && payerList.length > 1
                        ? 'Contributions add up exactly'
                        : payerRemaining > 0
                          ? `${formatMoney(payerRemaining)} of the bill unaccounted for`
                          : `${formatMoney(-payerRemaining)} more than the total`}
                    </Text>
                    {payerRemaining !== 0 && editing.kind === 'payer' ? (
                      <Button
                        title="Give rest"
                        variant="subtle"
                        size="sm"
                        onPress={() => givePayerRestTo((editing as { userId: string }).userId)}
                      />
                    ) : null}
                  </View>
                </>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payerRow}>
                  {members.map((member) => {
                    const selected = member.id === paidBy;
                    return (
                      <Pressable
                        key={member.id}
                        onPress={() => setPaidBy(member.id)}
                        style={[styles.payer, selected && styles.payerSelected]}
                      >
                        <Avatar name={member.name} id={member.id} size={38} />
                        <Text style={[styles.payerName, selected && styles.payerNameSelected]} numberOfLines={1}>
                          {member.id === userId ? 'You' : member.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

            <View style={styles.splitHeader}>
              <Text style={styles.detailLabel}>Split between</Text>
              <Segmented
                options={[
                  { label: 'Even', value: 'even' },
                  { label: 'Custom', value: 'custom' },
                ]}
                value={mode}
                onChange={switchMode}
                style={styles.modeToggle}
              />
            </View>

            <Card padded={false} style={styles.splitCard}>
              {members.map((member, index) => {
                const included =
                  effectiveParticipants.find((p) => p.userId === member.id)?.included ?? false;
                const line = split.lines.find((l) => l.userId === member.id);

                return (
                  <View key={member.id} style={[styles.splitRow, index > 0 && styles.splitRowBordered]}>
                    <Pressable
                      onPress={() => toggleMember(member.id)}
                      style={styles.splitToggle}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: included }}
                    >
                      <Ionicons
                        name={included ? 'checkmark-circle' : 'ellipse-outline'}
                        size={23}
                        color={included ? colors.primary : colors.textFaint}
                      />
                      <Avatar name={member.name} id={member.id} size={30} />
                      <Text style={[styles.splitName, !included && styles.splitNameOff]} numberOfLines={1}>
                        {member.id === userId ? 'You' : member.name}
                      </Text>
                    </Pressable>

                    {included && mode === 'custom' ? (
                      <Pressable
                        onPress={() => selectForEditing({ kind: 'member', userId: member.id })}
                        style={[
                          styles.shareBox,
                          editing.kind === 'member' &&
                            editing.userId === member.id &&
                            styles.shareBoxActive,
                        ]}
                        accessibilityLabel={`Edit ${member.name}'s share`}
                      >
                        <Text style={styles.shareBoxText}>
                          {formatMoney(Math.round(
                            effectiveParticipants.find((p) => p.userId === member.id)?.customCents ?? 0
                          ))}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.splitAmount, !included && styles.splitNameOff]}>
                        {included ? formatMoney(line?.shareCents ?? 0) : '—'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Card>

          </View>
        ) : null}
        </ScrollView>

        {/* Always reachable, never scrolled away from — and the reason Save
            is unavailable lives here too. Previously it sat in the scroll
            content and could hide behind this bar, which left the button
            simply dead with no explanation. */}
        <View style={styles.footer}>
          {mode === 'custom' && amountCents > 0 ? (
            <View style={styles.remainderBar}>
              <Ionicons
                name={remaining === 0 ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={remaining === 0 ? colors.positive : colors.warning}
              />
              <Text
                style={[
                  styles.remainderText,
                  remaining === 0 ? styles.remainderOk : styles.remainderOff,
                ]}
              >
                {remaining === 0
                  ? 'Shares add up exactly'
                  : remaining > 0
                    ? `${formatMoney(remaining)} still to assign`
                    : `${formatMoney(-remaining)} over the total`}
              </Text>

              {remaining !== 0 ? (
                <View style={styles.remainderActions}>
                  {editing.kind === 'member' ? (
                    <Button
                      title={`Give rest to ${
                        editingMember?.id === userId ? 'you' : (editingMember?.name.split(' ')[0] ?? 'them')
                      }`}
                      variant="subtle"
                      size="sm"
                      onPress={() => giveRestTo((editing as { userId: string }).userId)}
                    />
                  ) : null}
                  <Button title="Even out" variant="subtle" size="sm" onPress={evenOut} />
                </View>
              ) : null}
            </View>
          ) : null}

          {blockedReason ? <Text style={styles.blockedReason}>{blockedReason}</Text> : null}

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

/** Cents back to the digit string the keypad edits ("" for zero). */
function centsToRaw(cents: number): string {
  if (!cents) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 110, gap: spacing.md },

  amountBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  amountLabel: {
    ...typography.label,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: -spacing.xs,
  },
  amountLabelShare: { color: colors.primary },
  currency: { ...typography.title, fontSize: 26, color: colors.textMuted, marginTop: 10 },
  currencyShare: { color: colors.primary },
  amount: { ...typography.hero, fontSize: 56, lineHeight: 64 },
  amountShare: { color: colors.primary },
  perPerson: { ...typography.caption, textAlign: 'center', marginTop: -spacing.sm },

  descriptionField: { marginTop: spacing.xs },

  receiptCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  receiptImage: { width: 52, height: 66, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  receiptBody: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
  receiptTitle: { ...typography.bodyStrong },
  receiptNote: { ...typography.caption, lineHeight: 16 },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeLink: { ...typography.caption, color: colors.negative, fontWeight: '700' },
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

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  summaryBody: { flex: 1, gap: 1 },
  summaryTitle: { ...typography.bodyStrong },
  summaryMeta: { ...typography.caption },

  details: { gap: spacing.sm },
  detailLabel: { ...typography.label },
  payerRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  payer: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 74,
  },
  payerSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  payerName: { ...typography.caption, color: colors.textMuted },
  payerNameSelected: { color: colors.primary, fontWeight: '800' },

  splitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeToggle: { width: 150 },
  splitCard: { overflow: 'hidden' },
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
  shareBox: {
    minWidth: 92,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'flex-end',
  },
  shareBoxActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  shareBoxText: { ...typography.money, fontSize: 15 },
  shareBoxTextEmpty: { color: colors.textFaint },
  payerToggle: { width: 190 },
  payerHintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  payerHint: { ...typography.caption, fontWeight: '700', flex: 1 },

  remainderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  remainderText: { ...typography.caption, fontWeight: '700', flexShrink: 1 },
  remainderOk: { color: colors.positive },
  remainderOff: { color: colors.warning },
  remainderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' },
  blockedReason: {
    ...typography.caption,
    color: colors.negative,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },

  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: -spacing.sm,
  },
  editingBannerText: { ...typography.caption, color: colors.primary, fontWeight: '700' },

  warning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warningText: { ...typography.caption, color: colors.negative, flex: 1 },

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
});
