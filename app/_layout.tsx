// Per-weight imports: the package root ships all 18 weights (~3MB on web).
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogHost } from '../src/components/dialog';
import { Loading, Screen } from '../src/components/ui';
import { AuthProvider, useAuth } from '../src/data/auth';
import { isSupabaseConfigured } from '../src/lib/env';
import SetupRequired from '../src/screens/SetupRequired';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SetupRequired />
      </SafeAreaProvider>
    );
  }

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
        <DialogHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, initializing, recovering, recoveryError } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (initializing) return;
    const inAuthFlow = segments[0] === '(auth)';
    const onResetScreen = (segments as string[]).includes('reset-password');
    if (recovering || recoveryError) {
      if (!onResetScreen) router.replace('/(auth)/reset-password');
      return;
    }

    if (!session && !inAuthFlow) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthFlow && !onResetScreen) {
      router.replace('/(app)/groups');
    }
  }, [session, initializing, recovering, recoveryError, segments, router]);

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
