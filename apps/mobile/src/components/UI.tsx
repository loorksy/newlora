import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { useLocale } from '../i18n';
import { colors, radius, space, type } from '../theme';

export { colors };

export function Label({ style, ...props }: TextProps) {
  const { rtl } = useLocale();
  return (
    <Text
      {...props}
      style={[
        styles.text,
        {
          textAlign: rtl ? 'right' : 'left',
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}

export function Row({ style, ...props }: ViewProps) {
  const { rtl } = useLocale();
  return (
    <View
      {...props}
      style={[
        styles.row,
        { flexDirection: 'row', direction: rtl ? 'rtl' : 'ltr' },
        style,
      ]}
    />
  );
}

export function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        compact && styles.compact,
        (disabled || pressed) && styles.pressed,
      ]}
    >
      <Label
        style={[
          styles.buttonLabel,
          { color: primary ? colors.bg : colors.text, textAlign: 'center' },
        ]}
      >
        {label}
      </Label>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const { rtl } = useLocale();
  return (
    <TextInput
      placeholderTextColor={colors.secondary}
      {...props}
      style={[
        styles.input,
        {
          textAlign: rtl ? 'right' : 'left',
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        props.style,
      ]}
    />
  );
}

export const styles = StyleSheet.create({
  text: { color: colors.text, ...type.body },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  row: { alignItems: 'center', gap: space.sm },
  button: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  compact: { paddingHorizontal: space.md, minHeight: 44 },
  pressed: { opacity: 0.55 },
  buttonLabel: { ...type.button },
  input: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontSize: 15,
    minHeight: 48,
  },
  title: { color: colors.text, ...type.title },
  section: { color: colors.text, ...type.section },
  muted: { color: colors.secondary, ...type.meta, lineHeight: 18 },
  page: { padding: space.xl, gap: space.lg, paddingBottom: 40 },
  badge: { ...type.meta, color: colors.accent },
  divider: { height: 1, backgroundColor: colors.border },
});
