import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useLocale } from '../i18n';
import { colors, radius, space } from '../theme';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          selected && styles.selectedLabel,
          {
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
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  selectedLabel: { color: colors.bg },
  pressed: { opacity: 0.6 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
