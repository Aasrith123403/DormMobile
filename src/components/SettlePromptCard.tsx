import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { evaluateSettlePrompt } from '../core/settlePrompt';
import { todayIso } from '../core/subscriptions';
import { useAuth } from '../data/auth';
import { useGroup } from '../data/groupContext';
import { Button, Card } from './ui';
import { colors, spacing, typography } from '../theme';

/**
 * A passive settle nudge. Renders nothing unless the moment is right — see
 * `evaluateSettlePrompt` for what "right" means. There is no notification and
 * no new input: the card reads balances the app already computed and picks a
 * moment the user is already looking at the screen.
 */
export function SettlePromptCard() {
  const router = useRouter();
  const { userId } = useAuth();
  const { groupId, myNetCents, transfers, settlements } = useGroup();

  const prompt = evaluateSettlePrompt({
    myNetCents,
    today: todayIso(),
    lastSettledAt: settlements[0]?.settled_at ?? null,
    hasOutstanding: transfers.length > 0,
  });

  if (!prompt.show || !userId) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Ionicons
          name={prompt.reason === 'new-month' ? 'calendar-outline' : 'swap-horizontal'}
          size={20}
          color={colors.primary}
        />
        <View style={styles.body}>
          <Text style={styles.title}>{prompt.headline}</Text>
          <Text style={styles.detail}>{prompt.detail}</Text>
        </View>
      </View>

      <Button
        title="Settle up"
        size="sm"
        icon="arrow-forward"
        onPress={() => router.push({ pathname: '/(app)/settle', params: { groupId } })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderColor: colors.primary, borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  body: { flex: 1, gap: 2 },
  title: { ...typography.bodyStrong },
  detail: { ...typography.caption, lineHeight: 16 },
});
