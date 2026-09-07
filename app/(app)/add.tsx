import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurvedHero, Smiley } from '../../src/components/shapes';
import { Button, ChoiceRow } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/theme';

interface Intent {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  route: (groupId: string) => Parameters<ReturnType<typeof useRouter>['push']>[0];
}

const INTENTS: Intent[] = [
  {
    id: 'expense',
    label: 'Split an expense',
    sublabel: 'Groceries, rent, a takeaway',
    icon: 'receipt-outline',
    route: (groupId) => ({ pathname: '/(app)/expense/new', params: { groupId } }),
  },
  {
    id: 'event',
    label: 'Plan something',
    sublabel: 'Dinner, a night out, move-out',
    icon: 'calendar-outline',
    route: (groupId) => ({ pathname: '/(app)/event/new', params: { groupId } }),
  },
  {
    id: 'chore',
    label: 'Add a chore',
    sublabel: 'Then hand it to someone',
    icon: 'clipboard-outline',
    route: (groupId) => ({
      pathname: '/(app)/groups/[id]/house',
      params: { id: groupId, tab: 'chores' },
    }),
  },
  {
    id: 'supply',
    label: "Say we're out",
    sublabel: 'Flags a staple and names whose turn it is',
    icon: 'basket-outline',
    route: (groupId) => ({
      pathname: '/(app)/groups/[id]/house',
      params: { id: groupId, tab: 'supplies' },
    }),
  },
  {
    id: 'ping',
    label: 'Get everyone here',
    sublabel: 'A nudge, not a notification',
    icon: 'hand-left-outline',
    route: (groupId) => ({
      pathname: '/(app)/groups/[id]/house',
      params: { id: groupId, tab: 'status' },
    }),
  },
  {
    id: 'settle',
    label: 'Settle up',
    sublabel: 'Pay someone back',
    icon: 'swap-horizontal-outline',
    route: (groupId) => ({ pathname: '/(app)/settle', params: { groupId } }),
  },
];

export default function AddScreen() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [picked, setPicked] = useState<string | null>(null);
  const go = () => {
    const intent = INTENTS.find((item) => item.id === picked);
    if (!intent || !groupId) return;
    router.replace(intent.route(groupId));
  };

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(groupId ? `/(app)/groups/${groupId}` : '/(app)/groups');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <CurvedHero tone="sunset" contentStyle={styles.heroContent}>
          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <Smiley size={104} tone="brand" />
        </CurvedHero>

        <View style={styles.intro}>
          <Text style={styles.question}>What&rsquo;s on your mind?</Text>
          <Text style={styles.want}>I want to&hellip;</Text>
        </View>

        <View style={styles.list}>
          {INTENTS.map((intent) => (
            <ChoiceRow
              key={intent.id}
              label={intent.label}
              sublabel={intent.sublabel}
              icon={intent.icon}
              selected={picked === intent.id}

              onPress={() => setPicked((current) => (current === intent.id ? null : intent.id))}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {groupId ? (
          <Button title="Continue" onPress={go} disabled={!picked} />
        ) : (

          <Button
            title="Pick a group first"
            variant="secondary"
            onPress={() => router.replace('/(app)/groups')}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 120 },
  heroContent: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xxl + 20 },
  back: {
    alignSelf: 'flex-start',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  backPressed: { opacity: 0.6 },
  intro: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl, marginTop: spacing.md },
  question: { ...typography.hero, textAlign: 'center' },
  want: { ...typography.body, fontSize: 16 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.sm },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.xl,
    backgroundColor: colors.background,
  },
});
