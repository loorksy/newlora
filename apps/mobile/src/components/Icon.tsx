import React from 'react';
import { View } from 'react-native';
import { useColors } from '../theme';
import { iconMap, type IconName } from '../icons/map';

export function Icon({
  name,
  size = 22,
  color,
  label,
}: {
  name: IconName;
  size?: number;
  color?: string;
  label?: string;
}) {
  const colors = useColors();
  const Glyph = iconMap[name];
  const ink = color || colors.text;
  return (
    <View
      testID={`icon-${name}`}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      <Glyph color={ink} size={size} strokeWidth={1.75} />
    </View>
  );
}
