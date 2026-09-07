import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CATEGORIES, Category, CategoryId, getCategory } from '../core/categories';
import { tapFeedback } from './haptics';
import { colors, fonts, radius, spacing, typography } from '../theme';

export function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryId | null;
  onChange: (next: CategoryId) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {CATEGORIES.map((category) => {
        const active = category.id === value;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              tapFeedback();
              onChange(category.id);
            }}
            style={[
              styles.item,
              { backgroundColor: active ? category.softColor : colors.surface },
              active && { borderColor: category.color },
            ]}
          >
            <Ionicons
              name={category.icon as never}
              size={20}
              color={active ? category.color : colors.textFaint}
            />
            <Text
              style={[styles.label, active && { color: category.color, fontFamily: fonts.bold }]}
              numberOfLines={1}
            >
              {category.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function CategoryTag({ id }: { id: string | null | undefined }) {
  const category: Category = getCategory(id);
  return (
    <View style={[styles.tag, { backgroundColor: category.softColor }]}>
      <Ionicons name={category.icon as never} size={11} color={category.color} />
      <Text style={[styles.tagText, { color: category.color }]}>{category.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: 82,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  label: { ...typography.caption, fontSize: 11.5, fontFamily: fonts.bold, color: colors.textMuted },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  tagText: { fontSize: 10.5, fontFamily: fonts.bold },
});
