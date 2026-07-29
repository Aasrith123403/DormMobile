import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorBanner, Field, Screen } from '../../../src/components/ui';
import { createGroup } from '../../../src/data/groups';
import { friendlyError } from '../../../src/lib/supabase';
import { colors, radius, spacing, typography } from '../../../src/theme';

const SUGGESTIONS = ['Dorm', 'Apartment', 'Ski Trip', 'Road Trip'];

export default function NewGroupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const group = await createGroup(name);
      // Straight into the new group, with the join code ready to share.
      router.replace(`/(app)/groups/${group.id}`);
    } catch (caught) {
      setError(friendlyError(caught));
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      {error ? <ErrorBanner message={error} /> : null}

      <Field
        label="Group name"
        value={name}
        onChangeText={setName}
        placeholder="Dorm"
        autoFocus
        autoCapitalize="words"
        maxLength={60}
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((suggestion) => (
          <Pressable
            key={suggestion}
            onPress={() => setName(suggestion)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={styles.chipText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>

      <Button title="Create group" onPress={submit} loading={busy} disabled={!name.trim()} />

      <Card style={styles.note}>
        <Text style={styles.noteTitle}>What happens next</Text>
        <Text style={styles.noteText}>
          You get a six-character join code. Anyone who enters it joins the group and sees the same
          ledger, live.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.body, fontWeight: '500' },
  note: { marginTop: spacing.md, gap: spacing.xs },
  noteTitle: { ...typography.label, color: colors.text },
  noteText: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
});
