import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';

import { CurvedHero, Smiley } from '../../src/components/shapes';
import { Button, Card, ErrorBanner, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/data/auth';
import { friendlyError } from '../../src/lib/supabase';
import { colors, fonts, spacing, typography } from '../../src/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password, name);
      setNeedsConfirmation(true);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (needsConfirmation) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen scroll contentStyle={styles.content}>
          <CurvedHero tone="brand" contentStyle={styles.hero} style={styles.heroBleed}>
            <Smiley size={80} tone="sunset" asleep />
            <Text style={styles.wordmark}>Check your email</Text>
          </CurvedHero>
          <Card>
            <Text style={styles.body}>
              We sent a confirmation link to <Text style={styles.strong}>{email.trim()}</Text>. Tap it,
              then come back and sign in.
            </Text>
          </Card>
          <Text style={styles.hint}>
            Testing solo? Turn off “Confirm email” under Authentication → Sign In / Providers in
            Supabase and sign in right away.
          </Text>
          <Link href="/(auth)/sign-in" style={styles.link}>
            Back to sign in
          </Link>
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen scroll contentStyle={styles.content}>
          <CurvedHero tone="sunset" contentStyle={styles.hero} style={styles.heroBleed}>
            <Smiley size={80} tone="brand" />
            <Text style={styles.wordmark}>Create account</Text>
            <Text style={styles.tagline}>
              Everyone in the group needs one — it keeps the ledger shared and live.
            </Text>
          </CurvedHero>

          {error ? <ErrorBanner message={error} /> : null}

          <Card style={styles.pitch}>
            {[
              { icon: 'people-outline', text: 'Make a group for your dorm, flat or trip and share the code.' },
              { icon: 'receipt-outline', text: 'Log what you paid. Splitting and balances are automatic.' },
              { icon: 'card-outline', text: 'Settle up in Venmo — RoomLedger never touches your money.' },
            ].map((row) => (
              <View key={row.icon} style={styles.pitchRow}>
                <Ionicons name={row.icon as never} size={17} color={colors.primary} />
                <Text style={styles.pitchText}>{row.text}</Text>
              </View>
            ))}
          </Card>

          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Ana Lopez"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
          />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@school.edu"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            hint="Six characters minimum. You can change it later."
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={submit}
          />

          <Button
            title="Create account"
            onPress={submit}
            loading={busy}
            disabled={!name.trim() || !email.trim() || !password}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have one? </Text>
            <Link href="/(auth)/sign-in" style={styles.link}>
              Sign in
            </Link>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { gap: spacing.lg, padding: 0, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  heroBleed: { marginHorizontal: -spacing.xl, marginBottom: spacing.md },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + 16,
    gap: spacing.sm,
  },
  wordmark: { ...typography.display, color: colors.textInverse, marginTop: spacing.sm },
  tagline: {
    ...typography.body,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    maxWidth: 300,
  },
  body: { ...typography.body, lineHeight: 22 },
  strong: { fontFamily: fonts.bold },
  hint: { ...typography.caption, lineHeight: 18 },
  pitch: { gap: spacing.md, marginBottom: spacing.xs },
  pitchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pitchText: { ...typography.body, flex: 1, lineHeight: 20, color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md },
  footerText: { ...typography.body, color: colors.textMuted },
  link: { ...typography.body, color: colors.primary, fontFamily: fonts.semibold, textAlign: 'center' },
});
