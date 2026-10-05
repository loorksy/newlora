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
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.hit,
        (disabled || pressed) && styles.pressed,
      ]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: hit,
    height: hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.5 },
});
