import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { space, useColors } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { IconButton } from '../components/IconButton';
import { Button, Input, Label, Row, styles } from '../components/UI';

export function HistoryScreen({
  items,
  search,
  onSearch,
  onSubmitSearch,
  onOpen,
  onRename,
  onDelete,
  onCreate,
}: {
  items: Resource[];
  search: string;
  onSearch: (value: string) => void;
  onSubmitSearch: () => void;
  onOpen: (id: string) => void;
  onRename: (item: { id: string; title: string }) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  const { t, lang } = useLocale();
  const colors = useColors();
  return (
    <View style={layout.page}>
      <Label accessibilityRole="header" style={styles.title}>
        {t('chats')}
      </Label>
      <Row>
        <Input
          accessibilityLabel={t('search')}
          placeholder={t('search')}
          value={search}
          onChangeText={onSearch}
          style={{ flex: 1 }}
        />
        <Button compact label={t('search')} onPress={onSubmitSearch} />
      </Row>
      <Button primary label={t('newChat')} onPress={onCreate} />
      {items.length === 0 && <EmptyState title={t('emptyChats')} icon="chats" />}
      {items.map(item => (
        <View key={item.id} style={[layout.row, { borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(item.id)}
            style={{ flex: 1, gap: 2 }}
          >
            <Label>{String(item.data.title || t('newChat'))}</Label>
            {typeof item.data.activityStatus === 'string' && (
              <Label style={styles.badge}>{t(item.data.activityStatus)}</Label>
            )}
            <Label style={[styles.muted, layout.ltr]}>
              {isolate(new Date(item.updatedAt).toLocaleString(lang))}
            </Label>
          </Pressable>
          <IconButton
            name="more"
            label={t('rename')}
            size={32}
            iconSize={16}
            color={colors.secondary}
            onPress={() =>
              Alert.alert(String(item.data.title || t('newChat')), undefined, [
                {
                  text: t('rename'),
                  onPress: () =>
                    onRename({ id: item.id, title: String(item.data.title || '') }),
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
      ))}
    </View>
  );
}

const layout = StyleSheet.create({
  page: { gap: space.lg },
  row: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 8,
  },
  ltr: { writingDirection: 'ltr' },
});
