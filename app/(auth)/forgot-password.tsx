import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurvedHero, Smiley } from '../../src/components/shapes';
import { Button, Card, ErrorBanner, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/data/auth';
import { friendlyError } from '../../src/lib/supabase';
import { colors, fonts, spacing, typography } from '../../src/theme';

export default function ForgotPassword() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    if (busy || !email.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen scroll contentStyle={styles.content}>
          <CurvedHero tone="brand" contentStyle={styles.hero} style={styles.heroBleed}>
            <Smiley size={80} tone="sunset" asleep />
            <Text style={styles.wordmark}>Check your email</Text>
          </CurvedHero>

          <Card>
            <Text style={styles.body}>
              If <Text style={styles.strong}>{email.trim()}</Text> has an account, a reset link is on
              its way. Open it on this device and you can pick a new password.
            </Text>
          </Card>

          <Text style={styles.hint}>
            The link works once and expires after an hour. Nothing changes until you use it, so an
            old password keeps working in the meantime.
          </Text>

          <Button
            title="Back to sign in"
            variant="secondary"
            onPress={() => router.replace('/(auth)/sign-in')}
          />
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
            <Text style={styles.wordmark}>Forgot your password?</Text>
            <Text style={styles.tagline}>
              Put in your email and we&rsquo;ll send you a link to set a new one.
            </Text>
          </CurvedHero>

          {error ? <ErrorBanner message={error} /> : null}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@school.edu"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Button title="Send reset link" onPress={submit} loading={busy} disabled={!email.trim()} />

          <View style={styles.footer}>
            <Button
              title="Back to sign in"
              variant="ghost"
              onPress={() => router.replace('/(auth)/sign-in')}
            />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    gap: spacing.lg,
    padding: 0,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  heroBleed: { marginHorizontal: -spacing.xl, marginBottom: spacing.md },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + 16,
    gap: spacing.sm,
  },
  wordmark: {
    ...typography.display,
    color: colors.textInverse,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  tagline: {
    ...typography.body,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    maxWidth: 300,
  },
  body: { ...typography.body, lineHeight: 22 },
  strong: { color: colors.text, fontFamily: fonts.bold },
  hint: { ...typography.caption, lineHeight: 19 },
  footer: { marginTop: -spacing.sm },
});
