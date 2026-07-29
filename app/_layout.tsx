import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogHost } from '../src/components/dialog';
import { Loading, Screen } from '../src/components/ui';
import { AuthProvider, useAuth } from '../src/data/auth';
import { isSupabaseConfigured } from '../src/lib/env';
import SetupRequired from '../src/screens/SetupRequired';
import { colors } from '../src/theme';

export default function RootLayout() {
  // Fail loudly but gracefully when .env has not been filled in yet, rather
  // than throwing an opaque network error on the first query.
  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SetupRequired />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <RootNavigator />
        {/* Above the navigator so any screen can ask a question. */}
        <DialogHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;

    const inAuthFlow = segments[0] === '(auth)';

    if (!session && !inAuthFlow) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthFlow) {
      router.replace('/(app)/groups');
    }
  }, [session, initializing, segments, router]);

  if (initializing) {
    return (
      <Screen>
        <Loading label="Loading RoomLedger" />
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}
