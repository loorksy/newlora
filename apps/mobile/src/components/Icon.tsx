import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';
import { iconMap, type IconName } from '../icons/map';

export function Icon({
  name,
  size = 22,
  color = colors.text,
  label,
}: {
  name: IconName;
  size?: number;
  color?: string;
  label?: string;
}) {
  const Glyph = iconMap[name];
  return (
    <View
      testID={`icon-${name}`}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      <Glyph color={color} size={size} strokeWidth={1.75} />
    </View>
  );
}
