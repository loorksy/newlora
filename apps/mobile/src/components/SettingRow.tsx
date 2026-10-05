import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { forwardIcon, type IconName } from '../icons/map';
import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { Label, styles as ui } from './UI';

export function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const { rtl } = useLocale();
  const body = (
    <>
      <Icon name={icon} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Label>{label}</Label>
        {!!value && <Label style={ui.muted}>{value}</Label>}
      </View>
      {onPress && <Icon name={forwardIcon(rtl)} color={colors.secondary} />}
    </>
  );
  if (!onPress)
    return (
      <View accessibilityLabel={label} style={styles.row}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.row}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
});
