import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics are a native-only nicety. Wrapped here so call sites never have to
 * platform-check, and so a failure (simulator, permissions, unsupported
 * device) can never surface as an unhandled rejection over a button tap.
 */

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function safely(run: () => Promise<void>): void {
  if (!enabled) return;
  void run().catch(() => {
    /* haptics are decorative — never let them break an interaction */
  });
}

/** Light tick for ordinary taps. */
export function tapFeedback(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Firmer tap for a committed action, e.g. saving an expense. */
export function commitFeedback(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function successFeedback(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function warningFeedback(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
