import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { iconForActivity } from '../icons/map';
import type { ActivityItem } from '../app/types';
import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { Label, styles as ui } from './UI';

export function AgentActivity({ items }: { items: ActivityItem[] }) {
  const { t, rtl } = useLocale();
  if (!items.length) return null;
  return (
    <View
      accessibilityLabel={t('activity')}
      style={[styles.box, { direction: rtl ? 'rtl' : 'ltr' }]}
    >
      {items.map((item, index) => (
        <View key={`${item.key}-${index}`} style={styles.row}>
          <Icon
            name={iconForActivity(item.key)}
            size={16}
            color={item.key === 'tool_failed' ? colors.danger : colors.secondary}
          />
          <Label style={[ui.muted, styles.label]}>{item.label}</Label>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  label: { flex: 1 },
});
