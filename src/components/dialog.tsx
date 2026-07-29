import React, { useCallback, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing, typography } from '../theme';

/**
 * Cross-platform dialogs.
 *
 * React Native Web stubs `Alert.alert` out entirely — the implementation is
 * `static alert() {}` — so every confirmation built on it silently does
 * nothing in a browser. This renders a real Modal instead, which behaves the
 * same on web and native, so a confirm step can never quietly disappear on
 * one platform.
 *
 * The API is imperative on purpose: these are called from async handlers
 * (`if (await confirm(...))`), not from render.
 */

export type DialogActionStyle = 'default' | 'cancel' | 'destructive';

export interface DialogAction {
  label: string;
  value: string;
  style?: DialogActionStyle;
}

interface DialogRequest {
  title: string;
  message?: string;
  actions: DialogAction[];
  resolve: (value: string | null) => void;
}

let queue: DialogRequest[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCurrent(): DialogRequest | null {
  return queue[0] ?? null;
}

/** Generic form: resolves with the chosen action's value, or null if dismissed. */
export function showDialog(options: {
  title: string;
  message?: string;
  actions: DialogAction[];
}): Promise<string | null> {
  return new Promise((resolve) => {
    queue = [...queue, { ...options, resolve }];
    emit();
  });
}

export function confirm(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return showDialog({
    title: options.title,
    message: options.message,
    actions: [
      { label: options.cancelLabel ?? 'Cancel', value: 'cancel', style: 'cancel' },
      {
        label: options.confirmLabel ?? 'Confirm',
        value: 'confirm',
        style: options.destructive ? 'destructive' : 'default',
      },
    ],
  }).then((value) => value === 'confirm');
}

export function notify(options: {
  title: string;
  message?: string;
  okLabel?: string;
}): Promise<void> {
  return showDialog({
    title: options.title,
    message: options.message,
    actions: [{ label: options.okLabel ?? 'OK', value: 'ok' }],
  }).then(() => undefined);
}

/** A short list of choices, e.g. take a photo vs pick from the library. */
export function choose(options: {
  title: string;
  message?: string;
  options: { label: string; value: string }[];
  cancelLabel?: string;
}): Promise<string | null> {
  return showDialog({
    title: options.title,
    message: options.message,
    actions: [
      ...options.options.map((option) => ({ label: option.label, value: option.value })),
      { label: options.cancelLabel ?? 'Cancel', value: '__cancel__', style: 'cancel' as const },
    ],
  }).then((value) => (value === '__cancel__' ? null : value));
}

function resolveCurrent(value: string | null): void {
  const current = queue[0];
  if (!current) return;

  queue = queue.slice(1);
  emit();
  current.resolve(value);
}

/** Mount once, near the root, above everything that might ask a question. */
export function DialogHost() {
  const request = useSyncExternalStore(subscribe, getCurrent, getCurrent);

  const dismiss = useCallback(() => {
    const cancel = queue[0]?.actions.find((action) => action.style === 'cancel');
    resolveCurrent(cancel ? cancel.value : null);
  }, []);

  if (!request) return null;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={dismiss}
      // Web needs an explicit dismiss affordance; native gets the back button.
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        {/* Swallow taps inside the card so it does not dismiss itself. */}
        <Pressable style={[styles.card, shadow]} onPress={() => {}}>
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}

          <View style={styles.actions}>
            {request.actions.map((action) => (
              <Pressable
                key={action.value}
                accessibilityRole="button"
                onPress={() => resolveCurrent(action.value)}
                style={({ pressed }) => [
                  styles.action,
                  action.style === 'cancel' && styles.actionCancel,
                  action.style === 'destructive' && styles.actionDestructive,
                  action.style !== 'cancel' && action.style !== 'destructive' && styles.actionDefault,
                  pressed && styles.actionPressed,
                ]}
              >
                <Text
                  style={[
                    styles.actionText,
                    action.style === 'cancel' && styles.actionTextCancel,
                    action.style === 'destructive' && styles.actionTextDestructive,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...typography.title, fontSize: 19 },
  message: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  action: {
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  actionDefault: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionCancel: { backgroundColor: colors.surface, borderColor: colors.border },
  actionDestructive: { backgroundColor: colors.negativeSoft, borderColor: colors.negativeSoft },
  actionPressed: { opacity: 0.75 },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.textInverse },
  actionTextCancel: { color: colors.text },
  actionTextDestructive: { color: colors.negative },
});
