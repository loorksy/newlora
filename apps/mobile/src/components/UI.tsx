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
export const colors = {
  bg: '#101413',
  surface: '#191f1c',
  raised: '#222a25',
  border: '#303a33',
  text: '#f0f2ec',
  muted: '#99a59b',
  accent: '#a3c6ae',
  danger: '#e6a49d',
};
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
        { flexDirection: rtl ? 'row-reverse' : 'row' },
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
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && {
          backgroundColor: colors.accent,
          borderColor: colors.accent,
        },
        compact && { paddingHorizontal: 14 },
        (disabled || pressed) && { opacity: 0.55 },
      ]}
    >
      <Label
        style={{
          color: primary ? colors.bg : colors.text,
          textAlign: 'center',
          fontWeight: '600',
        }}
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
      placeholderTextColor={colors.muted}
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
  text: { color: colors.text, fontSize: 16, lineHeight: 25 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 12,
  },
  row: { alignItems: 'center', gap: 10 },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
  },
  title: {
    fontSize: 30,
    lineHeight: 42,
    fontWeight: '600',
    letterSpacing: -0.7,
  },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  page: { padding: 22, gap: 18, paddingBottom: 40 },
  badge: { fontSize: 12, color: colors.accent },
  divider: { height: 1, backgroundColor: colors.border },
});
