import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { ReactNode, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { tapFeedback } from './haptics';
import {
  avatarGradient,
  colors,
  gradients,
  initials,
  radius,
  shadow,
  shadowLifted,
  spacing,
  typography,
} from '../theme';

/* -------------------------------------------------------------- Screen -- */

export function Screen({
  children,
  scroll = false,
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  if (scroll) {
    return (
      <ScrollView
        style={[styles.screen, style]}
        contentContainerStyle={[styles.screenContent, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.screen, style]}>{children}</View>;
}

/* ------------------------------------------------------------ Pressable -- */

/**
 * Press feedback that actually feels like a button: a small spring scale plus
 * a haptic tick. Used by everything tappable so the whole app responds the
 * same way.
 */
export function Tappable({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  scaleTo = 0.97,
  haptic = true,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleTo?: number;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'checkbox' | 'none';
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: Platform.OS !== 'web',
      speed: 40,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => animate(scaleTo)}
      onPressOut={() => animate(1)}
      onPress={
        onPress
          ? () => {
              if (haptic) tapFeedback();
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Card -- */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const content = [styles.card, padded && styles.cardPadded, shadow, style];

  if (onPress) {
    return (
      <Tappable onPress={onPress} style={content} scaleTo={0.985}>
        {children}
      </Tappable>
    );
  }
  return <View style={content}>{children}</View>;
}

/** Full-bleed gradient card used for the balance heroes. */
export function GradientCard({
  children,
  colors: gradientColors = gradients.brand,
  style,
  onPress,
}: {
  children: ReactNode;
  colors?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const inner = (
    <LinearGradient
      colors={[gradientColors[0], gradientColors[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, style]}
    >
      {children}
    </LinearGradient>
  );

  // The shadow lives on a wrapper, which must share the gradient's radius or
  // its square corners show through behind the rounded card.
  if (onPress) {
    return (
      <Tappable onPress={onPress} style={[styles.gradientShadow, shadowLifted]} scaleTo={0.985}>
        {inner}
      </Tappable>
    );
  }
  return <View style={[styles.gradientShadow, shadowLifted]}>{inner}</View>;
}

/* -------------------------------------------------------------- Button -- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'venmo' | 'subtle';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  icon,
  size = 'md',
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Ionicons glyph name. */
  icon?: string;
  size?: 'sm' | 'md';
}) {
  const isDisabled = disabled || loading;
  const palette = buttonPalette[variant];

  return (
    <Tappable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={title}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSmall,
        { backgroundColor: palette.background, borderColor: palette.border },
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      <View style={styles.buttonInner}>
        {loading ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <>
            {icon ? <Ionicons name={icon as never} size={17} color={palette.text} /> : null}
            <Text
              style={[styles.buttonText, size === 'sm' && styles.buttonTextSmall, { color: palette.text }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </>
        )}
      </View>
    </Tappable>
  );
}

const buttonPalette: Record<ButtonVariant, { background: string; text: string; border: string }> = {
  primary: { background: colors.primary, text: colors.textInverse, border: colors.primary },
  secondary: { background: colors.surface, text: colors.text, border: colors.borderStrong },
  subtle: { background: colors.surfaceAlt, text: colors.text, border: 'transparent' },
  ghost: { background: 'transparent', text: colors.primary, border: 'transparent' },
  danger: { background: colors.negativeSoft, text: colors.negative, border: 'transparent' },
  venmo: { background: colors.venmo, text: colors.textInverse, border: colors.venmo },
};

/* --------------------------------------------------------------- Field -- */

export function Field({
  label,
  hint,
  error,
  style,
  inputStyle,
  icon,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  label?: string;
  hint?: string;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  icon?: string;
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        {icon ? <Ionicons name={icon as never} size={18} color={colors.textFaint} /> : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
          {...inputProps}
          style={[styles.input, inputStyle]}
        />
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- Avatar -- */

export function Avatar({
  name,
  size = 36,
  id,
  ring = false,
}: {
  name: string;
  size?: number;
  id?: string;
  ring?: boolean;
}) {
  const seed = id ?? name ?? '?';
  const [from, to] = avatarGradient(seed);

  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        ring && { borderWidth: 2, borderColor: colors.surface },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </LinearGradient>
  );
}

/** Overlapping avatars for "who is in this split". */
export function AvatarStack({
  people,
  size = 26,
  max = 4,
}: {
  people: { id: string; name: string }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <View style={styles.avatarStack}>
      {shown.map((person, index) => (
        <View key={person.id} style={index > 0 ? { marginLeft: -size * 0.34 } : undefined}>
          <Avatar name={person.name} id={person.id} size={size} ring />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.avatarMore,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.34 },
          ]}
        >
          <Text style={[styles.avatarMoreText, { fontSize: size * 0.36 }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- Icon bit -- */

/** Rounded, tinted icon tile — used for categories and stat rows. */
export function IconChip({
  icon,
  color,
  background,
  size = 38,
}: {
  icon: string;
  color: string;
  background: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconChip,
        { width: size, height: size, borderRadius: size / 3, backgroundColor: background },
      ]}
    >
      <Ionicons name={icon as never} size={size * 0.5} color={color} />
    </View>
  );
}

/* ------------------------------------------------------------ Feedback -- */

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={styles.emptyIconWrap}>
          <Ionicons name={icon as never} size={30} color={colors.primary} />
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.negative} />
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry ? (
        <Tappable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Tappable>
      ) : null}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'primary' | 'warning';
  icon?: string;
}) {
  const tones = {
    neutral: { background: colors.surfaceAlt, text: colors.textMuted },
    positive: { background: colors.positiveSoft, text: colors.positive },
    negative: { background: colors.negativeSoft, text: colors.negative },
    primary: { background: colors.primarySoft, text: colors.primary },
    warning: { background: colors.warningSoft, text: colors.warning },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: tones.background }]}>
      {icon ? <Ionicons name={icon as never} size={11} color={tones.text} /> : null}
      <Text style={[styles.badgeText, { color: tones.text }]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      {action}
    </View>
  );
}

/** iOS-style segmented control, used for split mode and insight ranges. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              tapFeedback();
              onChange(option.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------------------------------------------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardPadded: { padding: spacing.lg },

  gradientShadow: { borderRadius: radius.xl },
  gradientCard: { borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden' },

  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonSmall: { minHeight: 40, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonDisabled: { opacity: 0.42 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextSmall: { fontSize: 14 },

  field: { gap: spacing.xs },
  fieldLabel: { ...typography.label },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    minHeight: 48,
    // Removes the default focus ring on web in favour of the border.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputError: { borderColor: colors.negative },
  fieldError: { ...typography.caption, color: colors.negative },
  fieldHint: { ...typography.caption },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarMore: {
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarMoreText: { color: colors.textMuted, fontWeight: '800' },

  iconChip: { alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.heading, fontSize: 18, textAlign: 'center' },
  emptyMessage: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyAction: { marginTop: spacing.md, alignSelf: 'stretch' },

  loading: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  loadingLabel: { ...typography.caption },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.negativeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBannerText: { ...typography.body, color: colors.negative, flex: 1 },
  retry: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  retryText: { ...typography.bodyStrong, color: colors.negative },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    minHeight: 28,
  },
  sectionHeaderText: { ...typography.label },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.surface, ...shadow },
  segmentText: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
  segmentTextActive: { color: colors.text },
});
