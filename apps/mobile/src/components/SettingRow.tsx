import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { forwardIcon, type IconName } from '../icons/map';
import { radius, useColors } from '../theme';
import { Icon } from './Icon';
import { Label } from './UI';

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
  const colors = useColors();
  const body = (
    <>
      <Icon name={icon} size={18} color={colors.secondary} />
      <View style={{ flex: 1 }}>
        <Label>{label}</Label>
        {!!value && (
          <Label style={{ fontSize: 12, lineHeight: 16, color: colors.secondary }}>
            {value}
          </Label>
        )}
      </View>
      {onPress && (
        <Icon name={forwardIcon(rtl)} size={16} color={colors.secondary} />
      )}
    </>
  );
  const rowStyle = [
    styles.row,
    {
      direction: rtl ? ('rtl' as const) : ('ltr' as const),
      borderColor: colors.border,
      backgroundColor: colors.settingsSurface,
    },
  ];
  if (!onPress)
    return (
      <View accessibilityLabel={label} style={rowStyle}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={rowStyle}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
