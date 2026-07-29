import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { confirm } from '../../src/components/dialog';
import { Avatar, Button, Card, ErrorBanner, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/data/auth';
import { friendlyError } from '../../src/lib/supabase';
import { isValidVenmoHandle, normalizeVenmoHandle } from '../../src/venmo/deepLink';
import { colors, spacing, typography } from '../../src/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, updateProfile, signOut } = useAuth();

  const [name, setName] = useState('');
  const [venmo, setVenmo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(profile?.name ?? '');
    setVenmo(profile?.venmo_username ?? '');
  }, [profile?.name, profile?.venmo_username]);

  const handle = normalizeVenmoHandle(venmo);
  const venmoError = handle && !isValidVenmoHandle(handle) ? 'Letters, numbers, - and _ only.' : null;

  const save = async () => {
    if (busy || venmoError) return;

    setBusy(true);
    setError(null);

    try {
      await updateProfile({
        name: name.trim() || 'Roommate',
        venmo_username: handle || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = async () => {
    const confirmed = await confirm({
      title: 'Sign out?',
      message: 'Your groups and expenses stay where they are.',
      confirmLabel: 'Sign out',
      destructive: true,
    });

    if (!confirmed) return;
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <Screen scroll>
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.header}>
        <Avatar name={name || 'Roommate'} id={profile?.id} size={64} />
        <View style={styles.headerText}>
          <Text style={styles.headerName}>{name || 'Roommate'}</Text>
          <Text style={styles.headerEmail}>{session?.user.email}</Text>
        </View>
      </View>

      <Field label="Name" value={name} onChangeText={setName} placeholder="Ana Lopez" maxLength={60} />

      <Field
        label="Venmo username"
        value={venmo}
        onChangeText={setVenmo}
        placeholder="ana-lopez"
        autoCapitalize="none"
        autoCorrect={false}
        error={venmoError}
        hint="Roommates need this to pay you from the Settle Up screen."
      />

      <Button
        title={saved ? 'Saved' : 'Save changes'}
        onPress={save}
        loading={busy}
        disabled={Boolean(venmoError)}
      />

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>About your data</Text>
        <Text style={styles.cardText}>
          Expenses, balances and receipts are readable only by members of the groups you belong to —
          enforced by row-level security in the database, not just by this app. RoomLedger never
          connects to your bank and never moves money; payments happen in Venmo.
        </Text>
      </Card>

      <Button title="Sign out" variant="danger" onPress={() => void confirmSignOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  headerName: { ...typography.title },
  headerEmail: { ...typography.caption },

  card: { gap: spacing.xs, marginTop: spacing.md },
  cardTitle: { ...typography.label, color: colors.text },
  cardText: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
});
