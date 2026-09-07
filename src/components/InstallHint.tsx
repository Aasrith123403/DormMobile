import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from './ui';
import { colors, fonts, spacing, typography } from '../theme';

const DISMISSED_KEY = 'roomledger.installHint.dismissed';

export function InstallHint() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'prompt'>('ios');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as NavigatorWithStandalone).standalone === true;
    if (standalone) return;
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isPhone = isIos || /android/i.test(window.navigator.userAgent);
    if (!isPhone) return;
    let cancelled = false;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      if (cancelled) return;
      setDeferred(event as BeforeInstallPromptEvent);
      setPlatform('prompt');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    void AsyncStorage.getItem(DISMISSED_KEY).then((value) => {
      if (!cancelled && !value) {
        setPlatform(isIos ? 'ios' : 'prompt');
        setVisible(true);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    void AsyncStorage.setItem(DISMISSED_KEY, '1');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') dismiss();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
        <Text style={styles.title}>Keep it on your home screen</Text>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {platform === 'prompt' && deferred ? (
        <>
          <Text style={styles.body}>
            Add RoomLedger to your phone and it opens like any other app — full screen, no address
            bar.
          </Text>
          <Button title="Install" icon="download-outline" onPress={() => void install()} />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            RoomLedger works as an app on iPhone — no App Store needed. In Safari:
          </Text>
          <Step number={1} icon="share-outline">
            Tap the <Text style={styles.strong}>Share</Text> button at the bottom of Safari.
          </Step>
          <Step number={2} icon="add-circle-outline">
            Scroll down and tap <Text style={styles.strong}>Add to Home Screen</Text>.
          </Step>
          <Step number={3} icon="checkmark-circle-outline">
            Tap <Text style={styles.strong}>Add</Text>. It appears with your other apps.
          </Step>
          <Text style={styles.footnote}>
            This only works in Safari — Chrome on iPhone cannot add to the home screen.
          </Text>
        </>
      )}
    </Card>
  );
}

function Step({ number, icon, children }: { number: number; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Ionicons name={icon as never} size={16} color={colors.textMuted} />
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderColor: colors.primary, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.heading, fontSize: 16, flex: 1 },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  strong: { fontFamily: fonts.bold, color: colors.text },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: 11, fontFamily: fonts.bold, color: colors.primary },
  stepText: { ...typography.body, fontSize: 14, flex: 1 },
  footnote: { ...typography.caption, fontSize: 11.5, marginTop: spacing.xs },
});
