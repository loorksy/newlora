import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { colors, space } from '../theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Label } from './UI';

export function AppHeader({
  onMenu,
  status,
  online,
  action,
}: {
  onMenu: () => void;
  status: string;
  online: boolean;
  action?: React.ReactNode;
}) {
  const { t, rtl } = useLocale();
  return (
    <View style={[styles.bar, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <IconButton name="menu" label={t('menu')} onPress={onMenu} />
      <Icon name="brand" color={colors.accent} size={22} />
      <View style={styles.titles}>
        <Label numberOfLines={1} style={styles.brand}>
          {t('brand')}
        </Label>
        <Label numberOfLines={1} style={styles.scope}>
          {t('marketScope')}
        </Label>
      </View>
      {action}
      <View
        accessibilityLabel={status}
        style={[styles.pill, online ? styles.online : styles.offline]}
      >
        <Icon
          name={online ? 'success' : 'alert'}
          size={14}
          color={online ? colors.success : colors.danger}
        />
        <Label
          numberOfLines={1}
          style={[styles.pillText, { color: online ? colors.success : colors.danger }]}
        >
          {status}
        </Label>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 72,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  brand: { fontSize: 18, lineHeight: 22, fontWeight: '600' },
  scope: { color: colors.secondary, fontSize: 11, lineHeight: 14 },
  pill: {
    minHeight: 32,
    paddingHorizontal: space.sm,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
    maxWidth: '46%',
  },
  online: { borderColor: colors.success },
  offline: { borderColor: colors.danger },
  pillText: { fontSize: 11, lineHeight: 14, fontWeight: '600', flexShrink: 1 },
});
