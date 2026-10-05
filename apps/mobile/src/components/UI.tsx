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
import { radius, space, type, useColors } from '../theme';

export { colors } from '../theme';

export function Label({ style, ...props }: TextProps) {
  const { rtl } = useLocale();
  const colors = useColors();
  const incoming = StyleSheet.flatten(style);
  const color =
    incoming?.color ||
    (incoming?.fontSize === 12 || incoming?.fontSize === 13
      ? colors.secondary
      : colors.text);
  return (
    <Text
      {...props}
      style={[
        styles.text,
        { color },
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
  const colors = useColors();
  return (
    <View
      {...props}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    />
  );
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
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: colors.border,
          backgroundColor: colors.elevated,
        },
        primary && {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        compact && styles.compact,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Label
        style={[
          styles.buttonLabel,
          {
            color: primary ? colors.primaryForeground : colors.text,
            textAlign: 'center',
          },
        ]}
      >
        {label}
      </Label>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const { rtl } = useLocale();
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.secondary}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.settingsSurface,
          borderColor: colors.border,
          color: colors.text,
          textAlign: rtl ? 'right' : 'left',
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        props.style,
      ]}
    />
  );
}

export const styles = StyleSheet.create({
  text: { ...type.body },
  card: {
    borderWidth: 1,
    borderRadius: radius.control,
    padding: 14,
    gap: space.md,
  },
  row: { alignItems: 'center', gap: space.sm },
  button: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: space.md, minHeight: 36 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  buttonLabel: { ...type.button },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 40,
  },
  title: { ...type.title },
  section: { ...type.section },
  muted: { ...type.meta, lineHeight: 18 },
  page: { padding: space.lg, gap: space.lg, paddingBottom: 40 },
  badge: { ...type.meta },
  divider: { height: StyleSheet.hairlineWidth },
});
