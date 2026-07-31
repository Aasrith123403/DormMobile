import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { formatMoney } from '../core/money';
import { colors, radius } from '../theme';

/**
 * A deliberately small motion vocabulary: content settles in, money counts to
 * its new value, and proportions grow. Everything is short (under ~450ms) and
 * runs once — nothing loops, pulses or bounces, because this is an app people
 * open to read a number, not to be entertained.
 *
 * Every animation here collapses to an instant state change when the OS
 * "reduce motion" setting is on.
 */

/**
 * Decoration must never be load-bearing. requestAnimationFrame does not fire
 * in a hidden browser tab or a backgrounded app, so a JS-driven animation can
 * simply never run — which for a fade-in means content stuck at opacity 0,
 * and for a counter means a stale number. Every animation below therefore
 * arms a setTimeout (which does still fire when hidden) to force the final
 * state if the frames never come.
 */
const SETTLE_GRACE_MS = 250;

/** Tracks the platform reduce-motion preference, live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduced(enabled);
      })
      .catch(() => {
        /* older platforms simply do not report it */
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

/* --------------------------------------------------------------- FadeIn -- */

/**
 * Fades and lifts content into place. `index` staggers a list without each
 * row needing to know about its neighbours; the stagger is capped so a long
 * list never leaves the last item waiting.
 */
export function FadeIn({
  children,
  delay = 0,
  index = 0,
  distance = 10,
  style,
}: {
  children: ReactNode;
  delay?: number;
  index?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }

    const totalDelay = delay + Math.min(index, 6) * 45;

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: totalDelay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });

    animation.start();
    const settle = setTimeout(() => progress.setValue(1), totalDelay + 260 + SETTLE_GRACE_MS);

    return () => {
      animation.stop();
      clearTimeout(settle);
    };
  }, [progress, delay, index, reduced]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* --------------------------------------------------------- AnimatedMoney -- */

/**
 * Counts from the previous amount to the new one. The point is not decoration:
 * when someone else adds an expense over realtime, the number moving is what
 * tells you it changed rather than that you misread it.
 */
export function AnimatedMoney({
  cents,
  style,
  duration = 420,
}: {
  cents: number;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(cents);
  const previous = useRef(cents);

  useEffect(() => {
    const from = previous.current;
    previous.current = cents;

    if (reduced || from === cents) {
      setShown(cents);
      return;
    }

    const driver = new Animated.Value(0);
    const id = driver.addListener(({ value }) => {
      setShown(Math.round(from + (cents - from) * value));
    });

    const animation = Animated.timing(driver, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      // Text content cannot be driven natively — it has to cross to JS.
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) setShown(cents);
    });

    const settle = setTimeout(() => setShown(cents), duration + SETTLE_GRACE_MS);

    return () => {
      animation.stop();
      driver.removeListener(id);
      clearTimeout(settle);
    };
  }, [cents, duration, reduced]);

  return <Text style={style}>{formatMoney(shown)}</Text>;
}

/* ---------------------------------------------------------- AnimatedBar -- */

/** Proportion bar that grows to its share on mount and on change. */
export function AnimatedBar({
  percent,
  color,
  delay = 0,
}: {
  percent: number;
  color: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const target = Math.max(2, Math.min(100, percent));
  const width = useRef(new Animated.Value(reduced ? target : 0)).current;
  /**
   * Falls back to a plain width rather than nudging the Animated.Value:
   * setValue on an interpolated percentage does not necessarily flush without
   * a frame, and the whole point of the fallback is to work when frames are
   * not arriving.
   */
  const [settled, setSettled] = useState(reduced);

  useEffect(() => {
    setSettled(reduced);

    if (reduced) {
      width.setValue(target);
      return;
    }

    const animation = Animated.timing(width, {
      toValue: target,
      duration: 480,
      delay,
      easing: Easing.out(Easing.cubic),
      // Width is a layout property, so this one stays on the JS driver.
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) setSettled(true);
    });

    const settle = setTimeout(() => setSettled(true), delay + 480 + SETTLE_GRACE_MS);

    return () => {
      animation.stop();
      clearTimeout(settle);
    };
  }, [width, target, delay, reduced]);

  return (
    <View style={styles.track}>
      {settled ? (
        <View style={[styles.fill, { backgroundColor: color, width: `${target}%` }]} />
      ) : (
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: color,
              width: width.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      )}
    </View>
  );
}

/* --------------------------------------------------------------- Pop in -- */

/** Scale-and-fade entrance, used by the dialog card. */
export function PopIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }

    const animation = Animated.spring(progress, {
      toValue: 1,
      speed: 18,
      bounciness: 6,
      useNativeDriver: Platform.OS !== 'web',
    });

    animation.start();
    const settle = setTimeout(() => progress.setValue(1), 700);

    return () => {
      animation.stop();
      clearTimeout(settle);
    };
  }, [progress, reduced]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = {
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  } as ViewStyle,
  fill: { height: '100%', borderRadius: radius.pill } as ViewStyle,
};
