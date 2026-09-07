import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurvedHero, Smiley } from '../../src/components/shapes';
import { Button, ErrorBanner, Field, Screen } from '../../src/components/ui';
import { checkNewPassword, describePasswordProblem } from '../../src/core/recoveryLink';
import { useAuth } from '../../src/data/auth';
import { friendlyError } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';

export default function ResetPassword() {
  const router = useRouter();
  const { session, recovering, recoveryError, updatePassword, cancelRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = checkNewPassword(password, confirmation);
  const problemText = touched && confirmation ? describePasswordProblem(problem) : null;
  const submit = async () => {
    if (busy || problem) return;
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      router.replace('/(app)/groups');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const abandon = async () => {
    await cancelRecovery();
    router.replace('/(auth)/sign-in');
  };

  const linkDead = Boolean(recoveryError) || (!session && !recovering);
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen scroll contentStyle={styles.content}>
          <CurvedHero tone="sunset" contentStyle={styles.hero} style={styles.heroBleed}>
            <Smiley size={80} tone="brand" />
            <Text style={styles.wordmark}>
              {linkDead ? 'That link has expired' : 'Choose a new password'}
            </Text>
            {session?.user.email ? (
              <Text style={styles.tagline}>{session.user.email}</Text>
            ) : null}
          </CurvedHero>

          {linkDead ? (
            <>
              <Text style={styles.body}>
                {recoveryError ??
                  'Reset links work once and only for an hour. Ask for a fresh one and open it on this device.'}
              </Text>
              <Button
                title="Send a new link"
                onPress={() => router.replace('/(auth)/forgot-password')}
              />
              <Button
                title="Back to sign in"
                variant="ghost"
                onPress={() => router.replace('/(auth)/sign-in')}
              />
            </>
          ) : (
            <>
              {error ? <ErrorBanner message={error} /> : null}

              <Field
                label="New password"
                value={password}
                onChangeText={(next) => {
                  setPassword(next);
                  setTouched(true);
                }}
                placeholder="At least 8 characters"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
              />

              <Field
                label="Type it again"
                value={confirmation}
                onChangeText={(next) => {
                  setConfirmation(next);
                  setTouched(true);
                }}
                placeholder="Same again"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                error={problemText}
                onSubmitEditing={submit}
              />

              <Button
                title="Save new password"
                onPress={submit}
                loading={busy}
                disabled={Boolean(problem)}
              />

              <View style={styles.footer}>
                <Button title="Cancel" variant="ghost" onPress={() => void abandon()} />
              </View>
            </>
          )}
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
  tagline: { ...typography.body, color: 'rgba(255,255,255,0.92)', textAlign: 'center' },
  body: { ...typography.body, lineHeight: 22 },
  footer: { marginTop: -spacing.sm },
});
