import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { useColors, useTheme } from '../theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Label } from './UI';

export function AppHeader({
  onMenu,
  title,
  status,
  online,
  action,
}: {
  onMenu: () => void;
  title: string;
  status: string;
  online: boolean;
  action?: React.ReactNode;
}) {
  const { t, rtl } = useLocale();
  const colors = useColors();
  const { name, setTheme } = useTheme();
  return (
    <View
      testID="thread-header"
      style={[styles.bar, { direction: rtl ? 'rtl' : 'ltr' }]}
    >
      <View
        style={[
          styles.cluster,
          { backgroundColor: colors.bg },
        ]}
      >
        <IconButton
          name="menu"
          label={t('menu')}
          onPress={onMenu}
          color={colors.secondary}
          size={28}
          iconSize={14}
        />
        <Label numberOfLines={1} style={[styles.title, { color: colors.secondary }]}>
          {title}
        </Label>
      </View>
      <View style={{ flex: 1 }} />
      {action}
      <View
        accessibilityLabel={status}
        style={[styles.cluster, { backgroundColor: colors.bg }]}
      >
        <Icon
          name={online ? 'success' : 'alert'}
          size={14}
          color={online ? colors.success : colors.danger}
        />
        <IconButton
          name={name === 'dark' ? 'sun' : 'moon'}
          label={t('appearance')}
          onPress={() => setTheme(name === 'dark' ? 'light' : 'dark')}
          color={colors.secondary}
          size={32}
          iconSize={16}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 1,
    maxWidth: '70%',
  },
  title: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    flexShrink: 1,
    paddingHorizontal: 6,
  },
});
