import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurvedHero, Smiley } from '../../src/components/shapes';
import { Button, ErrorBanner, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/data/auth';
import { friendlyError } from '../../src/lib/supabase';
import { colors, fonts, spacing, typography } from '../../src/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen scroll contentStyle={styles.content}>
          <CurvedHero tone="sunset" contentStyle={styles.hero} style={styles.heroBleed}>
            <Smiley size={88} tone="brand" />
            <Text style={styles.wordmark}>RoomLedger</Text>
            <Text style={styles.tagline}>Shared expenses, settled without the group chat.</Text>
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
            returnKeyType="next"
          />

          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Button
            title="Sign in"
            onPress={submit}
            loading={busy}
            disabled={!email.trim() || !password}
          />

          <Link href="/(auth)/forgot-password" style={styles.forgot}>
            Forgot your password?
          </Link>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New here? </Text>
            <Link href="/(auth)/sign-up" style={styles.link}>
              Create an account
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
  heroBleed: { marginHorizontal: -spacing.xl, marginBottom: spacing.md },
  hero: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xxl + 16, gap: spacing.sm },
  wordmark: { ...typography.display, color: colors.textInverse, marginTop: spacing.sm },
  tagline: {
    ...typography.body,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    maxWidth: 280,
  },
  forgot: {
    ...typography.bodyStrong,
    color: colors.action,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    marginTop: -spacing.xs,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md },
  footerText: { ...typography.body, color: colors.textMuted },
  link: { ...typography.body, color: colors.primary, fontFamily: fonts.semibold },
});
