import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { iconForActivity } from '../icons/map';
import type { ActivityItem } from '../app/types';
import { useColors } from '../theme';
import { Icon } from './Icon';
import { Label } from './UI';

export function AgentActivity({ items }: { items: ActivityItem[] }) {
  const { t, rtl } = useLocale();
  const colors = useColors();
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
            size={14}
            color={item.key === 'tool_failed' ? colors.danger : colors.secondary}
          />
          <Label style={[styles.label, { color: colors.secondary }]}>{item.label}</Label>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  label: { flex: 1, fontSize: 13, lineHeight: 18 },
});
