import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { IconName } from '../icons/map';
import { colors, space } from '../theme';
import { Icon } from './Icon';
import { Label, styles as ui } from './UI';

export function EmptyState({
  title,
  icon = 'info',
}: {
  title: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.wrap}>
      <Icon name={icon} color={colors.secondary} />
      <Label style={[ui.muted, styles.copy]}>{title}</Label>
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
  copy: { textAlign: 'center' },
});
