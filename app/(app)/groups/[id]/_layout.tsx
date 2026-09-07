import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';

import { GroupProvider } from '../../../../src/data/groupContext';
import { colors, fonts, gradients } from '../../../../src/theme';

export default function GroupLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GroupProvider groupId={id}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: styles.bar,
          tabBarItemStyle: styles.item,
          tabBarLabelStyle: styles.label,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Today',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'flash' : 'flash-outline'} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'grid' : 'grid-outline'} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="you"
          options={{
            title: 'You',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? 'person' : 'person-outline'}
                color={color}
                focused={focused}
              />
            ),
          }}
        />

        <Tabs.Screen name="ledger" options={{ href: null }} />
        <Tabs.Screen name="balances" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="house" options={{ href: null }} />
        <Tabs.Screen name="insights" options={{ href: null }} />
        <Tabs.Screen name="subscriptions" options={{ href: null }} />
      </Tabs>
    </GroupProvider>
  );
}

function TabIcon({
  name,
  color,
  focused,
}: {
  name: string;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={styles.icon}>
      <Ionicons name={name as never} size={23} color={color as string} />
      {focused ? (
        <LinearGradient
          colors={[gradients.brand[0], gradients.brand[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dot}
        />
      ) : (
        <View style={styles.dotPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.background,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 12,
    paddingHorizontal: 12,
    elevation: 0,
  },
  item: { paddingTop: 2 },
  label: { fontFamily: fonts.medium, fontSize: 11, marginTop: 3 },
  icon: { alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotPlaceholder: { width: 5, height: 5 },
});
