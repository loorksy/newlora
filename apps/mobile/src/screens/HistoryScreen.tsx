import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { space } from '../theme';
import { EmptyState } from '../components/EmptyState';
import { Button, Card, Input, Label, Row, styles } from '../components/UI';

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
        <Card key={item.id}>
          <Pressable accessibilityRole="button" onPress={() => onOpen(item.id)}>
            <Label>{String(item.data.title || t('newChat'))}</Label>
            {typeof item.data.activityStatus === 'string' && (
              <Label style={styles.badge}>{t(item.data.activityStatus)}</Label>
            )}
            <Label style={[styles.muted, layout.ltr]}>
              {isolate(new Date(item.updatedAt).toLocaleString(lang))}
            </Label>
          </Pressable>
          <Row>
            <Button
              compact
              label={t('rename')}
              onPress={() =>
                onRename({ id: item.id, title: String(item.data.title || '') })
              }
            />
            <Button
              compact
              label={t('delete')}
              onPress={() =>
                Alert.alert(t('delete'), t('confirmDelete'), [
                  { text: t('cancel'), style: 'cancel' },
                  {
                    text: t('confirm'),
                    style: 'destructive',
                    onPress: () => onDelete(item.id),
                  },
                ])
              }
            />
          </Row>
        </Card>
      ))}
    </View>
  );
}

const layout = StyleSheet.create({
  page: { gap: space.lg },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
});
