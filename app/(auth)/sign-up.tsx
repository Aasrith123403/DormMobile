import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorBanner, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/data/auth';
import { friendlyError } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';

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
      // With email confirmation on (the Supabase default) no session arrives
      // until the link is clicked, so say so instead of hanging on this screen.
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
          <Text style={styles.wordmark}>Check your email</Text>
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
          <View style={styles.header}>
            <Text style={styles.wordmark}>Create account</Text>
            <Text style={styles.tagline}>Everyone in the group needs one — it keeps the ledger shared.</Text>
          </View>

          {error ? <ErrorBanner message={error} /> : null}

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
  content: { gap: spacing.lg, paddingTop: spacing.xxl },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  wordmark: { ...typography.display },
  tagline: { ...typography.body, color: colors.textMuted },
  body: { ...typography.body, lineHeight: 22 },
  strong: { fontWeight: '700' },
  hint: { ...typography.caption, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md },
  footerText: { ...typography.body, color: colors.textMuted },
  link: { ...typography.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});
