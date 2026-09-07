import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CurvedHero } from './shapes';
import { formatMoney } from '../core/money';
import { useGroup } from '../data/groupContext';
import { colors, fonts, gradients, spacing } from '../theme';

export function GroupHeader({
  title,
  subtitle,
  action,
  tone,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  tone?: keyof typeof gradients;
}) {
  const router = useRouter();
  const { group, myNetCents } = useGroup();
  const settled = myNetCents === 0;
  const resolvedTone: keyof typeof gradients =
    tone ?? (settled ? 'brand' : myNetCents > 0 ? 'positive' : 'sunset');
  return (
    <CurvedHero tone={resolvedTone} contentStyle={styles.hero}>
      <View style={styles.top}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.push('/(app)/groups'))}
          hitSlop={10}
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textInverse} />
        </Pressable>
        <View style={styles.actions}>{action}</View>
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title ?? group?.name ?? 'Your house'}
      </Text>

      <Text style={styles.meta} numberOfLines={1}>
        {subtitle ??
          (settled
            ? 'All settled up'
            : myNetCents > 0
              ? `You are owed ${formatMoney(myNetCents)}`
              : `You owe ${formatMoney(Math.abs(myNetCents))}`)}
      </Text>
    </CurvedHero>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: spacing.sm, paddingBottom: spacing.xxl + 8, gap: 2 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38,
    marginBottom: spacing.sm,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginLeft: -2,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    fontFamily: fonts.bold,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.6,
    color: colors.textInverse,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 2,
  },
});
