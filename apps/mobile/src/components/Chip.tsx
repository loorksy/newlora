import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useLocale } from '../i18n';
import { radius, useColors } from '../theme';

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { rtl } = useLocale();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: colors.border,
          backgroundColor: selected ? colors.primary : colors.surface,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: selected ? colors.primaryForeground : colors.text,
            writingDirection: rtl ? 'rtl' : 'ltr',
            textAlign: rtl ? 'right' : 'left',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  pressed: { opacity: 0.72 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
