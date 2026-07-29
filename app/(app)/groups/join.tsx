import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Card, ErrorBanner, Field, Screen } from '../../../src/components/ui';
import { joinGroupByCode } from '../../../src/data/groups';
import { friendlyError } from '../../../src/lib/supabase';
import { colors, spacing, typography } from '../../../src/theme';

export default function JoinGroupScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = code.trim().toUpperCase();

  const submit = async () => {
    if (busy || normalized.length < 4) return;
    setBusy(true);
    setError(null);

    try {
      const groupId = await joinGroupByCode(normalized);
      router.replace(`/(app)/groups/${groupId}`);
    } catch (caught) {
      setError(friendlyError(caught));
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      {error ? <ErrorBanner message={error} /> : null}

      <Field
        label="Join code"
        value={normalized}
        onChangeText={setCode}
        placeholder="A1B2C3"
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        returnKeyType="go"
        onSubmitEditing={submit}
        inputStyle={styles.codeInput}
      />

      <Button
        title="Join group"
        onPress={submit}
        loading={busy}
        disabled={normalized.length < 4}
      />

      <Card style={styles.note}>
        <Text style={styles.noteTitle}>Where do I find the code?</Text>
        <Text style={styles.noteText}>
          Whoever created the group can read it off the group screen — it is shown under the group
          name and on every group card.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    minHeight: 64,
  },
  note: { marginTop: spacing.md, gap: spacing.xs },
  noteTitle: { ...typography.label, color: colors.text },
  noteText: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
});
