import { Ionicons } from '@expo/vector-icons';
import { Tabs, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { GroupProvider } from '../../../../src/data/groupContext';
import { colors } from '../../../../src/theme';

/**
 * One provider above the tabs: every tab reads the same live snapshot, so
 * adding an expense updates the ledger, the balances and the insights in the
 * same frame.
 */
export default function GroupLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <GroupProvider groupId={id}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 86 : 62,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="ledger"
          options={{
            title: 'Ledger',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="balances"
          options={{
            title: 'Balances',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'swap-horizontal' : 'swap-horizontal-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: 'Insights',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'stats-chart' : 'stats-chart-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        {/* Reachable from the Ledger header; six tabs is too many. */}
        <Tabs.Screen name="subscriptions" options={{ href: null }} />
        <Tabs.Screen
          name="house"
          options={{
            title: 'House',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </GroupProvider>
  );
}
