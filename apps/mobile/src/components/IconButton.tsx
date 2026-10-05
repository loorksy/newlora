import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { hit } from '../theme';
import { Icon } from './Icon';
import type { IconName } from '../icons/map';

export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  color,
  size = hit,
  iconSize = 18,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size < hit ? Math.ceil((hit - size) / 2) : 4}
      style={({ pressed }) => [
        styles.hit,
        { width: size, height: size, borderRadius: 12 },
        (disabled || pressed) && styles.pressed,
      ]}
    >
      <Icon name={name} size={iconSize} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
});
