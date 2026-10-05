import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import type { IconName } from '../icons/map';
import type { ScreenId } from '../app/types';
import { radius, useColors } from '../theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Input, Label } from './UI';

const items: { id: ScreenId; icon: IconName; label: string }[] = [
  { id: 'chats', icon: 'chats', label: 'chats' },
  { id: 'recommendations', icon: 'recommendations', label: 'recommendations' },
  { id: 'tasks', icon: 'tasks', label: 'tasks' },
  { id: 'usage', icon: 'usage', label: 'usage' },
];

export function Drawer({
  visible,
  screen,
  session,
  conversations,
  search,
  online,
  server,
  reduceMotion,
  onClose,
  onNavigate,
  onNewChat,
  onSearch,
  onOpen,
  onRename,
  onDelete,
}: {
  visible: boolean;
  screen: ScreenId;
  session: string | null;
  conversations: Resource[];
  search: string;
  online: boolean;
  server: string;
  reduceMotion: boolean;
  onClose: () => void;
  onNavigate: (screen: ScreenId) => void;
  onNewChat: () => void;
  onSearch: (value: string) => void;
  onOpen: (id: string) => void;
  onRename: (item: { id: string; title: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { t, rtl, lang } = useLocale();
  const colors = useColors();
  const direction = rtl ? 'rtl' : 'ltr';
  const query = search.trim().toLowerCase();
  const shown = conversations.filter(item => {
    const title = String(item.data.title || t('newChat')).toLowerCase();
    return query === '' || title.includes(query);
  });
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
          style={[
            styles.panel,
            { direction, backgroundColor: colors.sidebar },
          ]}
        >
          <View style={styles.brandRow}>
            <Icon name="brand" size={32} color={colors.sidebarForeground} />
            <View style={{ flex: 1 }} />
            <IconButton
              name="compose"
              label={t('newChat')}
              onPress={onNewChat}
              color={colors.sidebarContent}
              size={32}
              iconSize={16}
            />
          </View>
          <View style={styles.nav}>
            {items.map(item => {
              const active = !session && screen === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(item.label)}
                  onPress={() => onNavigate(item.id)}
                  style={[
                    styles.item,
                    active && { backgroundColor: colors.sidebarSelected },
                  ]}
                >
                  <Icon
                    name={item.icon}
                    size={18}
                    color={active ? colors.sidebarForeground : colors.sidebarContent}
                  />
                  <Label
                    style={[
                      styles.itemLabel,
                      {
                        color: active ? colors.sidebarForeground : colors.sidebarContent,
                      },
                    ]}
                  >
                    {t(item.label)}
                  </Label>
                </Pressable>
              );
            })}
          </View>
          <Input
            accessibilityLabel={t('search')}
            placeholder={t('search')}
            value={search}
            onChangeText={onSearch}
            style={styles.search}
          />
          <ScrollView
            style={styles.navScroll}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            <Label style={[styles.group, { color: colors.sidebarMuted }]}>
              {t('chats')}
            </Label>
            {shown.length === 0 && (
              <Label style={[styles.empty, { color: colors.sidebarMuted }]}>
                {t('emptyChats')}
              </Label>
            )}
            {shown.map(item => {
              const active = session === item.id;
              const title = String(item.data.title || t('newChat'));
              return (
                <View key={item.id} style={styles.chatRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => onOpen(item.id)}
                    style={[
                      styles.chatMain,
                      active && { backgroundColor: colors.sidebarSelected },
                    ]}
                  >
                    <Label
                      numberOfLines={1}
                      style={[styles.itemLabel, { color: colors.sidebarContent, flex: 1 }]}
                    >
                      {title}
                    </Label>
                    <Label style={[styles.time, { color: colors.sidebarMuted }]}>
                      {isolate(new Date(item.updatedAt).toLocaleString(lang))}
                    </Label>
                  </Pressable>
                  <IconButton
                    name="more"
                    label={t('rename')}
                    size={32}
                    iconSize={16}
                    color={colors.sidebarMuted}
                    onPress={() =>
                      Alert.alert(title, undefined, [
                        {
                          text: t('rename'),
                          onPress: () =>
                            onRename({
                              id: item.id,
                              title: String(item.data.title || ''),
                            }),
                        },
                        {
                          text: t('delete'),
                          style: 'destructive',
                          onPress: () =>
                            Alert.alert(t('delete'), t('confirmDelete'), [
                              { text: t('cancel'), style: 'cancel' },
                              {
                                text: t('confirm'),
                                style: 'destructive',
                                onPress: () => onDelete(item.id),
                              },
                            ]),
                        },
                        { text: t('cancel'), style: 'cancel' },
                      ])
                    }
                  />
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings')}
            accessibilityState={{ selected: screen === 'settings' }}
            onPress={() => onNavigate('settings')}
            style={[
              styles.footer,
              { borderTopColor: colors.border },
              screen === 'settings' && { backgroundColor: colors.sidebarSelected },
            ]}
          >
            <Icon name="settings" size={16} color={colors.sidebarContent} />
            <View style={{ flex: 1 }}>
              <Label style={[styles.itemLabel, { color: colors.sidebarContent }]}>
                {t('settings')}
              </Label>
              <Label style={[styles.itemLabel, { color: colors.sidebarMuted, fontSize: 11 }]}>
                {t(online ? 'connected' : 'offline')}
              </Label>
              {server !== '' && (
                <Label style={[styles.server, { color: colors.sidebarMuted }]}>
                  {isolate(server)}
                </Label>
              )}
            </View>
          </Pressable>
        </SafeAreaView>
        <Pressable
          accessibilityLabel={t('close')}
          style={[styles.backdrop, { backgroundColor: '#00000066' }]}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  panel: {
    width: 300,
    maxWidth: '88%',
    paddingTop: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 16,
    paddingEnd: 8,
    paddingBottom: 16,
    gap: 4,
  },
  nav: { paddingHorizontal: 8, gap: 2, paddingBottom: 8 },
  item: {
    minHeight: 32,
    borderRadius: radius.control,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemLabel: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
  search: { marginHorizontal: 12, minHeight: 36, marginBottom: 8 },
  navScroll: { flex: 1 },
  list: { paddingHorizontal: 8, paddingBottom: 12, gap: 2 },
  group: { fontSize: 12, lineHeight: 16, paddingHorizontal: 8, paddingVertical: 6 },
  empty: { fontSize: 13, lineHeight: 18, paddingHorizontal: 8, paddingVertical: 8 },
  chatRow: { flexDirection: 'row', alignItems: 'center' },
  chatMain: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.control,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  time: { fontSize: 11, lineHeight: 14, writingDirection: 'ltr' },
  footer: {
    minHeight: 52,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  server: { fontSize: 11, lineHeight: 14, writingDirection: 'ltr' },
  backdrop: { flex: 1 },
});
