import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tapFeedback } from './haptics';
import { colors, radius, spacing, typography } from '../theme';

/**
 * A dedicated amount pad.
 *
 * The system keyboard on a numeric field is slower than it looks: it animates
 * in, covers half the screen, and pushes the rest of the form out of view. A
 * fixed pad keeps the whole expense on screen at once, which is what makes
 * logging land in a few taps rather than a scroll-and-hunt — and it is why
 * per-person custom shares are edited here too rather than in text fields
 * that the keyboard would sit on top of.
 *
 * Emits raw keys rather than a finished string so the parent can decide what
 * a keypress means — notably "start fresh" when the pad is handed to a new
 * field. `applyKey` in core/amountInput does the actual text maths.
 */

export type KeypadKey = string; // '0'-'9' | '.' | 'delete' | 'clear'

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
  keyText: { ...typography.title, fontSize: 25, fontWeight: '600' },
});
