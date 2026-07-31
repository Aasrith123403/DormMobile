import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * The design system.
 *
 * Money is the reason people open RoomLedger, so the type scale is built
 * around it: amounts get the largest, heaviest, tabular type on every screen,
 * and green/red carry one meaning consistently — green is "coming to you",
 * red is "going out". Everything else is deliberately quiet so the numbers
 * carry the screen.
 */

export const colors = {
  background: '#F5F6FA',
  backgroundAlt: '#EEF0F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F8',
  surfaceSunken: '#E9ECF3',
  border: '#E4E7EF',
  borderStrong: '#C9CFDD',

  text: '#0B1220',
  textMuted: '#5B6779',
  textFaint: '#93A0B4',
  textInverse: '#FFFFFF',

  primary: '#4F46E5',
  primaryDark: '#3F35D1',
  primaryLight: '#7C74F0',
  primarySoft: '#ECEBFE',

  positive: '#03875F',
  positiveSoft: '#E2F5EE',
  negative: '#D01D4B',
  negativeSoft: '#FDE9EF',

  venmo: '#008CFF',
  warning: '#B45309',
  warningSoft: '#FDF2E3',

  /** Overlay behind modals and dialogs. */
  scrim: 'rgba(11, 18, 32, 0.45)',
} as const;

/**
 * Gradients give the hero cards depth without any image assets.
 * Each is a `[from, to]` pair for expo-linear-gradient.
 */
export const gradients = {
  brand: ['#5B54F0', '#8B5CF6'] as const,
  positive: ['#059669', '#0EA47A'] as const,
  negative: ['#E11D48', '#F43F5E'] as const,
  neutral: ['#475569', '#64748B'] as const,
  night: ['#111C33', '#25324F'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 44,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 30,
  pill: 999,
} as const;

/** Resting elevation for cards. */
export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: 2 },
  default: {
    // react-native-web maps boxShadow through style, and the RN shadow props
    // are ignored there.
    boxShadow: '0 6px 18px rgba(11, 18, 32, 0.06)',
  },
}) as ViewStyle;

/** Stronger elevation for hero cards and floating actions. */
export const shadowLifted: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  android: { elevation: 8 },
  default: { boxShadow: '0 14px 30px rgba(11, 18, 32, 0.18)' },
}) as ViewStyle;

const numeric: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography = {
  hero: { fontSize: 44, fontWeight: '800', letterSpacing: -1.2, color: colors.text, ...numeric } as TextStyle,
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, color: colors.text } as TextStyle,
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: colors.text } as TextStyle,
  heading: { fontSize: 17, fontWeight: '700', color: colors.text } as TextStyle,
  body: { fontSize: 15, fontWeight: '400', color: colors.text } as TextStyle,
  bodyStrong: { fontSize: 15, fontWeight: '600', color: colors.text } as TextStyle,
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textMuted,
  } as TextStyle,
  caption: { fontSize: 12.5, fontWeight: '500', color: colors.textFaint } as TextStyle,
  money: { fontSize: 16, fontWeight: '700', color: colors.text, ...numeric } as TextStyle,
  moneyLarge: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: colors.text, ...numeric } as TextStyle,
} as const;

/** Deterministic avatar colours, so a person looks the same on every screen. */
const AVATAR_PALETTE: readonly (readonly [string, string])[] = [
  ['#6366F1', '#8B5CF6'],
  ['#0891B2', '#22D3EE'],
  ['#DB2777', '#F472B6'],
  ['#EA580C', '#FB923C'],
  ['#059669', '#34D399'],
  ['#2563EB', '#60A5FA'],
  ['#B45309', '#F59E0B'],
  ['#7C3AED', '#A78BFA'],
];

function hashOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return hash;
}

export function avatarGradient(seed: string): readonly [string, string] {
  return AVATAR_PALETTE[hashOf(seed ?? '?') % AVATAR_PALETTE.length];
}

export function avatarColor(seed: string): string {
  return avatarGradient(seed)[0];
}

export function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
