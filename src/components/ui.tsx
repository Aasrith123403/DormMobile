import Ionicons from '@expo/vector-icons/Ionicons';
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
import { Smiley } from './shapes';
import { avatarGradient, colors, fonts, glow, gradients, initials, radius, shadowLifted, spacing, typography } from '../theme';

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

export function Tappable({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  scaleTo = 0.96,
  haptic = true,
  accessibilityLabel,
  accessibilityRole = 'button',
  selected,
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
  selected?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) => {
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: Platform.OS !== 'web',
      speed: 40,
      bounciness: 5,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
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
      delayLongPress={450}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
  padded = true,
  raised = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  padded?: boolean;
  raised?: boolean;
}) {
  const content = [styles.card, raised && styles.cardRaised, padded && styles.cardPadded, style];
  if (onPress || onLongPress) {
    return (
      <Tappable onPress={onPress} onLongPress={onLongPress} style={content} scaleTo={0.985}>
        {children}
      </Tappable>
    );
  }
  return <View style={content}>{children}</View>;
}

export function GradientCard({
  children,
  tone = 'brand',
  style,
  onPress,
}: {
  children: ReactNode;
  tone?: keyof typeof gradients;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const pair = gradients[tone];
  const inner = (
    <LinearGradient
      colors={[pair[0], pair[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, style]}
    >
      {children}
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Tappable onPress={onPress} style={[styles.gradientShadow, shadowLifted]} scaleTo={0.985}>
        {inner}
      </Tappable>
    );
  }
  return <View style={[styles.gradientShadow, shadowLifted]}>{inner}</View>;
}

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
        { backgroundColor: palette.background },

        variant === 'primary' && !isDisabled ? glow() : null,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      <View style={styles.buttonInner}>
        {loading ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <>
            {icon ? <Ionicons name={icon as never} size={18} color={palette.text} /> : null}
            <Text
              style={[
                styles.buttonText,
                size === 'sm' && styles.buttonTextSmall,
                { color: palette.text },
              ]}
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

const buttonPalette: Record<ButtonVariant, { background: string; text: string }> = {
  primary: { background: colors.action, text: colors.textInverse },
  secondary: { background: colors.surfaceSunken, text: colors.text },
  subtle: { background: colors.surface, text: colors.text },
  ghost: { background: 'transparent', text: colors.action },
  danger: { background: colors.negativeSoft, text: colors.negative },
  venmo: { background: colors.venmo, text: colors.textInverse },
};

export function CircleButton({
  icon,
  onPress,
  size = 56,
  tone = 'dark',
  accessibilityLabel,
  style,
}: {
  icon: string;
  onPress: () => void;
  size?: number;
  tone?: 'dark' | 'light' | 'action' | 'ghost';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    dark: { background: colors.text, icon: colors.textInverse },
    light: { background: colors.surfaceRaised, icon: colors.text },
    action: { background: colors.action, icon: colors.textInverse },
    ghost: { background: 'rgba(255,255,255,0.25)', icon: colors.textInverse },
  }[tone];

  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? icon}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Ionicons name={icon as never} size={size * 0.42} color={palette.icon} />
    </Tappable>
  );
}

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
        {icon ? <Ionicons name={icon as never} size={19} color={colors.textSoft} /> : null}
        <TextInput
          placeholderTextColor={colors.textSoft}
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

export function ChoiceRow({
  label,
  sublabel,
  icon,
  selected = false,
  onPress,
  disabled,
  multi = false,
}: {
  label: string;
  sublabel?: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  multi?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      selected={selected}
      scaleTo={0.985}
      style={[styles.choiceRow, selected && styles.choiceRowSelected]}
    >
      {icon ? (
        <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
          <Ionicons
            name={icon as never}
            size={19}
            color={selected ? colors.action : colors.textMuted}
          />
        </View>
      ) : null}

      <View style={styles.choiceBody}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]} numberOfLines={2}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.choiceSub} numberOfLines={2}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.choiceMark,
          multi && styles.choiceMarkSquare,
          selected && styles.choiceMarkSelected,
        ]}
      >
        {selected ? <Ionicons name="checkmark" size={15} color={colors.textInverse} /> : null}
      </View>
    </Tappable>
  );
}

export function Avatar({
  name,
  size = 40,
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
        ring && { borderWidth: 2.5, borderColor: colors.background },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </LinearGradient>
  );
}

export function AvatarStack({
  people,
  size = 28,
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
        <View key={person.id} style={index > 0 ? { marginLeft: -size * 0.32 } : undefined}>
          <Avatar name={person.name} id={person.id} size={size} ring />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={[
            styles.avatarMore,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.32 },
          ]}
        >
          <Text style={[styles.avatarMoreText, { fontSize: size * 0.34 }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function IconChip({
  icon,
  color,
  background,
  size = 42,
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
        { width: size, height: size, borderRadius: size / 2.6, backgroundColor: background },
      ]}
    >
      <Ionicons name={icon as never} size={size * 0.48} color={color} />
    </View>
  );
}

export function MetaRow({ items }: { items: { icon?: string; label: string }[] }) {
  return (
    <View style={styles.metaRow}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.metaItem}>
          {item.icon ? (
            <Ionicons name={item.icon as never} size={13} color={colors.textSoft} />
          ) : null}
          <Text style={styles.metaText} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  tone = 'brand',
}: {
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
  tone?: keyof typeof gradients;
}) {
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={styles.emptyIconWrap}>
          <Ionicons name={icon as never} size={30} color={colors.primary} />
        </View>
      ) : (
        <Smiley size={84} tone={tone} />
      )}
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
      <Ionicons name="alert-circle" size={19} color={colors.negative} />
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
  tone?: 'neutral' | 'positive' | 'negative' | 'primary' | 'warning' | 'action';
  icon?: string;
}) {
  const tones = {
    neutral: { background: colors.surfaceAlt, text: colors.textMuted },
    positive: { background: colors.positiveSoft, text: colors.positive },
    negative: { background: colors.negativeSoft, text: colors.negative },
    primary: { background: colors.primarySoft, text: colors.primaryDark },
    warning: { background: colors.warningSoft, text: colors.warning },
    action: { background: colors.actionSoft, text: colors.action },
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

export function SectionHeader({
  title,
  action,
  style,
}: {
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      {action}
    </View>
  );
}

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
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: spacing.xl, paddingBottom: spacing.xxxl * 2, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
  cardRaised: { backgroundColor: colors.surfaceAlt },
  cardPadded: { padding: spacing.lg },
  gradientShadow: { borderRadius: radius.xl },
  gradientCard: { borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden' },
  button: {
    minHeight: 56,
    borderRadius: radius.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonSmall: { minHeight: 42, paddingHorizontal: spacing.lg },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.2 },
  buttonTextSmall: { fontSize: 14 },
  field: { gap: spacing.sm },
  fieldLabel: { ...typography.label },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  input: {
    flex: 1,
    paddingVertical: spacing.lg,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    minHeight: 56,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  inputError: { borderColor: colors.negative },
  fieldError: { ...typography.caption, color: colors.negative },
  fieldHint: { ...typography.caption },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 62,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  choiceRowSelected: { backgroundColor: colors.surfaceAlt },
  choiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  choiceIconSelected: { backgroundColor: colors.primarySoft },
  choiceBody: { flex: 1, gap: 1 },
  choiceLabel: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  choiceLabelSelected: { fontFamily: fonts.semibold, color: colors.text },
  choiceSub: { ...typography.caption, fontSize: 12.5 },
  choiceMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceMarkSquare: { borderRadius: 9 },
  choiceMarkSelected: { backgroundColor: colors.action, borderColor: colors.action },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontFamily: fonts.bold },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarMore: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.background,
  },
  avatarMoreText: { color: colors.textMuted, fontFamily: fonts.bold },
  iconChip: { alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 0 },
  metaText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textSoft, flexShrink: 1 },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.title, textAlign: 'center' },
  emptyMessage: { ...typography.body, textAlign: 'center', maxWidth: 300 },
  emptyAction: { marginTop: spacing.sm, alignSelf: 'stretch' },
  loading: { padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  loadingLabel: { ...typography.caption },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.negativeSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  errorBannerText: { ...typography.body, color: colors.negative, flex: 1 },
  retry: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  retryText: { ...typography.bodyStrong, color: colors.negative },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.2 },
  divider: { height: 1, backgroundColor: colors.border },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    minHeight: 32,
    gap: spacing.md,
  },
  sectionHeaderText: { ...typography.title, flex: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, color: colors.textInverse },
});
