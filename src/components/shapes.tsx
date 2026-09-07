import { LinearGradient } from 'expo-linear-gradient';
import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { fonts, gradients } from '../theme';

export function GlowOrb({
  size = 320,
  tone = 'brand',
  opacity = 0.5,
  style,
}: {
  size?: number;
  tone?: keyof typeof gradients;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [from] = gradients[tone];
  const id = `glow-${tone}`;
  return (
    <View style={[styles.noPointer, { width: size, height: size }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={from} stopOpacity={opacity} />
            <Stop offset="1" stopColor={from} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function CurvedHero({
  children,
  tone = 'brand',
  style,
  contentStyle,
  flat = false,
}: {
  children?: ReactNode;
  tone?: keyof typeof gradients;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  flat?: boolean;
}) {
  return (
    <View style={[styles.hero, style]}>
      {!flat ? (
        <>
          <GlowOrb size={300} tone={tone} opacity={0.42} style={styles.glowTopRight} />
          <GlowOrb size={230} tone="violet" opacity={0.3} style={styles.glowTopLeft} />
        </>
      ) : null}
      <View style={[styles.heroContent, contentStyle]}>{children}</View>
    </View>
  );
}

export function GradientNumber({
  value,
  size = 64,
  tone = 'brand',
  align = 'left',
  width = 320,
}: {
  value: string;
  size?: number;
  tone?: keyof typeof gradients;
  align?: 'left' | 'center';
  width?: number;
}) {
  const [from, to] = gradients[tone];
  const id = `num-${tone}-${align}`;
  const height = Math.round(size * 1.32);
  return (
    <Svg width={width} height={height} style={styles.noPointer}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </SvgGradient>
      </Defs>
      <SvgText
        x={align === 'center' ? width / 2 : 0}
        y={size}
        fill={`url(#${id})`}
        fontSize={size}
        fontFamily={fonts.bold}
        textAnchor={align === 'center' ? 'middle' : 'start'}
      >
        {value}
      </SvgText>
    </Svg>
  );
}

export function Squiggle({
  values,
  width = 320,
  height = 140,
  tone = 'brand',
  strokeWidth = 9,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: keyof typeof gradients;
  strokeWidth?: number;
}) {
  const [from, to] = gradients[tone];
  const id = `squiggle-${tone}`;
  if (values.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = strokeWidth;
  const points = values.map((value, index) => ({
    x: pad + (index / (values.length - 1)) * (width - pad * 2),
    y: height - pad - ((value - min) / span) * (height - pad * 2),
  }));

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const midX = (previous.x + current.x) / 2;
    d += ` C ${midX} ${previous.y} ${midX} ${current.y} ${current.x} ${current.y}`;
  }

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </SvgGradient>
      </Defs>
      <Path
        d={d}
        stroke={`url(#${id})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function Smiley({
  size = 96,
  tone = 'brand',
  asleep = false,
}: {
  size?: number;
  tone?: keyof typeof gradients;
  asleep?: boolean;
}) {
  const [from, to] = gradients[tone];
  const id = `smiley-${tone}-${asleep ? 'z' : 'a'}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </SvgGradient>
      </Defs>

      <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />

      {/* Arcs, never dots — dots read as surprised, arcs read as content. */}
      <Path d="M26 45 Q34 35 42 45" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" fill="none" />
      <Path d="M58 45 Q66 35 74 45" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" fill="none" />
      <Path
        d={asleep ? 'M38 62 Q50 66 62 62' : 'M36 58 Q50 71 64 58'}
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export function BlobTile({
  tone = 'brand',
  width = 96,
  height = 72,
  children,
  style,
}: {
  tone?: keyof typeof gradients;
  width?: number;
  height?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [from, to] = gradients[tone];
  return (
    <View style={[{ width, height }, styles.tile, style]}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 75"
        style={[StyleSheet.absoluteFill, styles.noPointer]}
      >
        <Path
          d="M-10 58 Q20 34 46 50 Q74 68 110 44 L110 80 L-10 80 Z"
          fill="rgba(255,255,255,0.18)"
        />
      </Svg>
      {children ? <View style={styles.tileContent}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  noPointer: { pointerEvents: 'none' },
  hero: { overflow: 'hidden' },
  heroContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
  glowTopRight: { position: 'absolute', top: -150, right: -110 },
  glowTopLeft: { position: 'absolute', top: -120, left: -100 },
  tile: { borderRadius: 18, overflow: 'hidden' },
  tileContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
