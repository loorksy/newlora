import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocale, isolate } from '../i18n';
import type { IconName } from '../icons/map';
import type { ScreenId } from '../app/types';
import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Label } from './UI';

const items: { id: ScreenId; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'home' },
  { id: 'chats', icon: 'chats', label: 'chats' },
  { id: 'recommendations', icon: 'recommendations', label: 'recommendations' },
  { id: 'tasks', icon: 'tasks', label: 'tasks' },
  { id: 'usage', icon: 'usage', label: 'usage' },
  { id: 'settings', icon: 'settings', label: 'settings' },
];

export function Drawer({
  visible,
  screen,
  online,
  server,
  reduceMotion,
  onClose,
  onNavigate,
}: {
  visible: boolean;
  screen: ScreenId;
  online: boolean;
  server: string;
  reduceMotion: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenId) => void;
}) {
  const { t, rtl } = useLocale();
  const direction = rtl ? 'rtl' : 'ltr';
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { direction }]}>
        <SafeAreaView
          testID="drawer-panel"
          style={[styles.panel, { direction }]}
        >
          <View style={styles.top}>
            <Icon name="brand" color={colors.accent} />
            <Label style={styles.brand}>{t('brand')}</Label>
            <View style={{ flex: 1 }} />
            <IconButton name="close" label={t('close')} onPress={onClose} />
          </View>
          <ScrollView
            style={styles.navScroll}
            contentContainerStyle={styles.nav}
            keyboardShouldPersistTaps="handled"
          >
            {items.map(item => {
              const active = screen === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(item.label)}
                  onPress={() => onNavigate(item.id)}
                  style={[styles.item, active && styles.active]}
                >
                  <Icon
                    name={item.icon}
                    color={active ? colors.accent : colors.secondary}
                  />
                  <Label style={[styles.itemLabel, active && styles.activeLabel]}>
                    {t(item.label)}
                  </Label>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Icon
              name={online ? 'success' : 'alert'}
              size={16}
              color={online ? colors.success : colors.danger}
            />
            <View style={{ flex: 1 }}>
              <Label style={styles.footerLabel}>
                {t(online ? 'connected' : 'offline')}
              </Label>
              {server !== '' && (
                <Label
                  numberOfLines={1}
                  style={[styles.server, { writingDirection: 'ltr' }]}
                >
                  {isolate(server)}
                </Label>
              )}
            </View>
          </View>
        </SafeAreaView>
        <Pressable
          accessibilityLabel={t('close')}
          style={styles.backdrop}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: '#00000099' },
  panel: {
    width: '86%',
    backgroundColor: colors.surface,
    padding: space.xxl,
    borderColor: colors.border,
    borderEndWidth: 1,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  navScroll: { flex: 1 },
  nav: { gap: space.sm, marginTop: space.xxxl, paddingBottom: space.md },
  item: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  active: { backgroundColor: colors.strong },
  itemLabel: { fontSize: 15, lineHeight: 20, color: colors.text },
  activeLabel: { color: colors.accent },
  footer: {
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  footerLabel: { fontSize: 13, lineHeight: 18 },
  server: { color: colors.secondary, fontSize: 11, lineHeight: 14 },
  backdrop: { flex: 1 },
});
