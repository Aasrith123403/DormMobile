import Ionicons from '@expo/vector-icons/Ionicons';
import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BlobTile } from './shapes';
import { MetaRow, Tappable } from './ui';
import { colors, fonts, gradients, radius, spacing } from '../theme';

export interface TimelineEntry {
  id: string;
  title: string;
  meta: { icon?: string; label: string }[];
  tone?: keyof typeof gradients;
  icon?: string;
  done?: boolean;
  current?: boolean;
  onPress?: () => void;
  action?: ReactNode;
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <View style={styles.list}>
      {entries.map((entry) => (
        <ActionCard key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

function ActionCard({ entry }: { entry: TimelineEntry }) {
  return (
    <Tappable
      onPress={entry.onPress ?? (() => {})}
      disabled={!entry.onPress}
      scaleTo={0.985}
      accessibilityLabel={entry.title}
      style={[styles.card, entry.done && styles.cardDone]}
    >
      <View style={styles.top}>
        <BlobTile tone={entry.tone ?? 'brand'} width={52} height={52} style={styles.tile}>
          {entry.icon ? (
            <Ionicons name={entry.icon as never} size={22} color="#FFFFFF" />
          ) : null}
        </BlobTile>

        <View style={styles.body}>
          <Text style={[styles.title, entry.done && styles.titleDone]} numberOfLines={2}>
            {entry.title}
          </Text>
          <MetaRow items={entry.meta} />
        </View>
      </View>

      {entry.action ? <View style={styles.action}>{entry.action}</View> : null}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardDone: { opacity: 0.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { borderRadius: 16 },
  body: { flex: 1, gap: 3 },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, color: colors.text },
  titleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  action: { alignSelf: 'flex-start' },
});
