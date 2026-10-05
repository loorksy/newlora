import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { IconName } from '../icons/map';
import { space, useColors } from '../theme';
import { Icon } from './Icon';
import { Label } from './UI';

export function EmptyState({
  title,
  icon = 'info',
}: {
  title: string;
  icon?: IconName;
}) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={18} color={colors.secondary} />
      <Label style={[styles.copy, { color: colors.secondary }]}>{title}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  copy: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
