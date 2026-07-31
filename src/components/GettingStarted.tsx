import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  OnboardingFacts,
  onboardingProgress,
  onboardingSteps,
  shouldShowOnboarding,
} from '../core/onboarding';
import { AnimatedBar, FadeIn } from './motion';
import { Card, Tappable } from './ui';
import { colors, radius, spacing, typography } from '../theme';

/** Dismissal is per account, so a shared device does not hide it for someone new. */
const dismissKey = (userId: string) => `roomledger.onboarding.dismissed.${userId}`;

export function useOnboardingDismissed(userId: string | null) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setDismissed(null);
      return;
    }

    AsyncStorage.getItem(dismissKey(userId))
      .then((value) => {
        if (active) setDismissed(value === '1');
      })
      .catch(() => {
        // Storage failing should show the tips, not hide them.
        if (active) setDismissed(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const dismiss = useCallback(async () => {
    setDismissed(true);
    if (userId) {
      await AsyncStorage.setItem(dismissKey(userId), '1').catch(() => {
        /* it will simply reappear next launch */
      });
    }
  }, [userId]);

  return { dismissed, dismiss };
}

/**
 * A short checklist for a new account. Every item is derived from real data,
 * so it ticks itself off as the user goes and vanishes once the group is set
 * up — no notifications, no badges, and dismissible at any point.
 */
export function GettingStarted({
  facts,
  dismissed,
  onDismiss,
}: {
  facts: OnboardingFacts;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const router = useRouter();

  if (!shouldShowOnboarding(facts, dismissed)) return null;

  const steps = onboardingSteps(facts);
  const progress = onboardingProgress(steps);

  const go = (id: string) => {
    if (id === 'group') router.push('/(app)/groups/new');
    else if (id === 'venmo') router.push('/(app)/profile');
    // "invite" and "expense" both live inside a group, which the user reaches
    // by opening it — pointing elsewhere would be guesswork.
  };

  return (
    <FadeIn>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Getting started</Text>
            <Text style={styles.subtitle}>
              {progress.doneCount} of {progress.total} done
            </Text>
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Hide getting started"
          >
            <Ionicons name="close" size={18} color={colors.textFaint} />
          </Pressable>
        </View>

        <AnimatedBar percent={progress.percent} color={colors.primary} />

        <View style={styles.steps}>
          {steps.map((step, index) => {
            const actionable = !step.done && (step.id === 'group' || step.id === 'venmo');

            return (
              <FadeIn key={step.id} index={index} distance={6}>
                <Tappable
                  onPress={actionable ? () => go(step.id) : undefined}
                  haptic={actionable}
                  scaleTo={actionable ? 0.99 : 1}
                  style={styles.step}
                >
                  <Ionicons
                    name={step.done ? 'checkmark-circle' : (step.icon as never)}
                    size={21}
                    color={step.done ? colors.positive : colors.primary}
                  />
                  <View style={styles.stepBody}>
                    <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>
                      {step.title}
                    </Text>
                    {!step.done ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
                  </View>
                  {actionable ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  ) : null}
                </Tappable>
              </FadeIn>
            );
          })}
        </View>
      </Card>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { gap: 1 },
  title: { ...typography.heading },
  subtitle: { ...typography.caption },

  steps: { gap: spacing.xs },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  stepBody: { flex: 1, gap: 2 },
  stepTitle: { ...typography.bodyStrong, fontSize: 14.5 },
  stepTitleDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  stepDetail: { ...typography.caption, lineHeight: 16 },
});
