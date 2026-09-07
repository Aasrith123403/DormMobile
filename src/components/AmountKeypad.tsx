import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tapFeedback } from './haptics';
import { colors, fonts, radius, typography } from '../theme';

export type KeypadKey = string;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'delete'];

export function AmountKeypad({
  onKey,
  disabled,
}: {
  onKey: (key: KeypadKey) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.pad}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={key === 'delete' ? 'Delete' : key}
          onPress={() => {
            tapFeedback();
            onKey(key);
          }}
          onLongPress={key === 'delete' ? () => onKey('clear') : undefined}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          {key === 'delete' ? (
            <Ionicons name="backspace-outline" size={22} color={colors.text} />
          ) : (
            <Text style={styles.keyText}>{key}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: {
    width: '33.333%',
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyPressed: { backgroundColor: colors.surfaceSunken },
  keyText: { ...typography.title, fontSize: 25, fontFamily: fonts.semibold },
});
