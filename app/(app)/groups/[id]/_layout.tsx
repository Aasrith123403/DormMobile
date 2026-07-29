import { Ionicons } from '@expo/vector-icons';
import { Tabs, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { GroupProvider } from '../../../../src/data/groupContext';
import { colors, typography } from '../../../../src/theme';

/**
 * One provider above the tabs: every tab reads the same live snapshot, so
 * adding an expense updates the ledger, the balances and the subscription
 * list in the same frame.
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
          },
          tabBarLabelStyle: { ...typography.caption, fontWeight: '600' },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Ledger',
            tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="balances"
          options={{
            title: 'Balances',
            tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="subscriptions"
          options={{
            title: 'Plans',
            tabBarIcon: ({ color, size }) => <Ionicons name="repeat" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="supplies"
          options={{
            title: 'Supplies',
            tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="status"
          options={{
            title: 'Status',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </GroupProvider>
  );
}
