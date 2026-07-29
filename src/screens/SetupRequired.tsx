import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Screen } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

const STEPS = [
  'Create a project at supabase.com.',
  'Open SQL Editor and run supabase/migrations/0001_init.sql.',
  'Copy .env.example to .env.',
  'Paste your Project URL and anon key from Project Settings → Data API.',
  'Restart the dev server: npx expo start -c',
];

/**
 * Shown instead of the app when .env is missing credentials — a blank screen
 * and a network error would be a worse first run.
 */
export default function SetupRequired() {
  return (
    <SafeAreaView style={styles.safe}>
      <Screen scroll>
        <Text style={styles.title}>RoomLedger</Text>
        <Text style={styles.subtitle}>Almost there — connect a Supabase project to get started.</Text>

        <Card style={styles.card}>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.number}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </Card>

        <Text style={styles.footnote}>
          Full instructions, including the OCR and Venmo setup, are in README.md.
        </Text>
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.display, marginTop: spacing.xl },
  subtitle: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
  card: { gap: spacing.lg },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  number: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  stepText: { ...typography.body, flex: 1, lineHeight: 21 },
  footnote: { ...typography.caption, marginTop: spacing.md },
});
