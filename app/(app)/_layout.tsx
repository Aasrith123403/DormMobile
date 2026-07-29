import { Stack } from 'expo-router';
import React from 'react';

import { colors, typography } from '../../src/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: typography.heading,
      }}
    >
      <Stack.Screen name="groups/index" options={{ headerShown: false }} />
      <Stack.Screen name="groups/[id]" options={{ headerShown: false }} />

      <Stack.Screen
        name="groups/new"
        options={{ presentation: 'modal', title: 'New group' }}
      />
      <Stack.Screen
        name="groups/join"
        options={{ presentation: 'modal', title: 'Join a group' }}
      />
      <Stack.Screen
        name="expense/new"
        options={{ presentation: 'modal', title: 'Add expense' }}
      />
      <Stack.Screen
        name="subscription/new"
        options={{ presentation: 'modal', title: 'New subscription' }}
      />
      <Stack.Screen name="settle" options={{ presentation: 'modal', title: 'Settle up' }} />
      <Stack.Screen name="group-info" options={{ presentation: 'modal', title: 'Group' }} />
      <Stack.Screen name="profile" options={{ presentation: 'modal', title: 'Your profile' }} />
    </Stack>
  );
}
