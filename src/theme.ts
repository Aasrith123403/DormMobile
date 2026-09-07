import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  background: '#141020',
  backgroundAlt: '#1A1528',
  surface: '#221C36',
  surfaceAlt: '#2C2545',
  surfaceSunken: '#1B1629',
  surfaceRaised: '#332B4F',
  border: '#2F2749',
  borderStrong: '#413764',
  text: '#FFFFFF',
  textMuted: '#A79FC6',
  textFaint: '#6B6390',
  textSoft: '#8A82AC',
  textInverse: '#FFFFFF',
  primary: '#7C5CFC',
  primaryDark: '#6743E8',
  primaryLight: '#A78BFA',
  primarySoft: '#2A2350',
  pink: '#EC4899',
  pinkSoft: '#3A1F3D',
  coral: '#FB7185',
  action: '#7C5CFC',
  actionDark: '#6743E8',
  actionSoft: '#2A2350',
  positive: '#34D399',
  positiveSoft: '#12352C',
  negative: '#FB7185',
  negativeSoft: '#3A1F2C',
  venmo: '#3D95FF',
  warning: '#FBBF24',
  warningSoft: '#3A2F16',
  scrim: 'rgba(8, 5, 16, 0.72)',
} as const;

export const gradients = {
  brand: ['#8B5CF6', '#EC4899'] as const,
  violet: ['#7C5CFC', '#A855F7'] as const,
  sunset: ['#A855F7', '#FB7185'] as const,
  positive: ['#34D399', '#059669'] as const,
  negative: ['#FB7185', '#E11D48'] as const,
  calm: ['#4A4270', '#2F2749'] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  xl: 32,
  xxl: 40,
  pill: 999,
} as const;

export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
  default: { boxShadow: '0 6px 14px rgba(0, 0, 0, 0.35)' } as ViewStyle,
}) as ViewStyle;

export const shadowLifted: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
  },
  android: { elevation: 12 },
  default: { boxShadow: '0 14px 28px rgba(0, 0, 0, 0.55)' } as ViewStyle,
}) as ViewStyle;

export const glow = (color: string = colors.primary): ViewStyle =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: 0.55,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 10 },
    default: { boxShadow: `0 8px 22px ${color}66` } as ViewStyle,
  }) as ViewStyle;

// Use these instead of fontWeight: React Native ignores fontWeight when a
// style names a font family, so bold silently disappears on Android.
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const typography = {
  hero: {
    fontFamily: fonts.bold,
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
    letterSpacing: -1,
  } as TextStyle,
  display: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    letterSpacing: -0.6,
  } as TextStyle,
  title: {
    fontFamily: fonts.semibold,
    fontSize: 21,
    lineHeight: 27,
    color: colors.text,
    letterSpacing: -0.3,
  } as TextStyle,
  heading: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    letterSpacing: -0.1,
  } as TextStyle,
  body: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textMuted,
  } as TextStyle,
  bodyStrong: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.text,
  } as TextStyle,

  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  } as TextStyle,
  caption: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textMuted,
  } as TextStyle,
  money: {
    fontFamily: fonts.semibold,
    fontSize: 15.5,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
  moneyLarge: {
    fontFamily: fonts.bold,
    fontSize: 44,
    lineHeight: 50,
    color: colors.text,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
} as const;

const AVATAR_PAIRS: readonly (readonly [string, string])[] = [
  ['#A78BFA', '#7C3AED'],
  ['#F472B6', '#DB2777'],
  ['#818CF8', '#4F46E5'],
  ['#FB7185', '#E11D48'],
  ['#C084FC', '#9333EA'],
  ['#60A5FA', '#2563EB'],
  ['#34D399', '#059669'],
  ['#FBBF24', '#D97706'],
];

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function avatarGradient(seed: string): readonly [string, string] {
  return AVATAR_PAIRS[hashSeed(seed) % AVATAR_PAIRS.length];
}

export function avatarColor(seed: string): string {
  return avatarGradient(seed)[1];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
