import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * One place for colour and spacing. Balances are the reason people open the
 * app, so money gets the strongest type on every screen and green/red carry
 * the "owed to you" / "you owe" meaning consistently.
 */

export const colors = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EFF1F5',
  border: '#E2E5EB',
  borderStrong: '#CBD1DB',

  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  textInverse: '#FFFFFF',

  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primarySoft: '#EEF0FE',

  positive: '#047857',
  positiveSoft: '#E6F5EF',
  negative: '#BE123C',
  negativeSoft: '#FDECF0',

  venmo: '#008CFF',
  warning: '#B45309',
  warningSoft: '#FEF3E2',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  default: { elevation: 2 },
}) as ViewStyle;

const numeric: TextStyle = {
  fontVariant: ['tabular-nums'],
};

export const typography = {
  display: { fontSize: 34, fontWeight: '700', color: colors.text, ...numeric } as TextStyle,
  title: { fontSize: 22, fontWeight: '700', color: colors.text } as TextStyle,
  heading: { fontSize: 17, fontWeight: '600', color: colors.text } as TextStyle,
  body: { fontSize: 15, fontWeight: '400', color: colors.text } as TextStyle,
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted } as TextStyle,
  caption: { fontSize: 12, fontWeight: '500', color: colors.textFaint } as TextStyle,
  money: { fontSize: 16, fontWeight: '600', color: colors.text, ...numeric } as TextStyle,
  moneyLarge: { fontSize: 30, fontWeight: '700', color: colors.text, ...numeric } as TextStyle,
} as const;

/** Deterministic avatar colour so a person looks the same on every screen. */
export function avatarColor(seed: string): string {
  const palette = ['#4F46E5', '#0891B2', '#7C3AED', '#DB2777', '#EA580C', '#059669', '#2563EB', '#B45309'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return palette[hash % palette.length];
}

export function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
