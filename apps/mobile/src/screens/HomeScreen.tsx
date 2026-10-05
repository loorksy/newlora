import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { space } from '../theme';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { SectionHeader } from '../components/SectionHeader';
import { Card, Label, styles as ui } from '../components/UI';

const prompts = ['analyzeXau', 'usdNews', 'monitor', 'compare'] as const;

export function HomeScreen({
  composer,
  recent,
  onPrefill,
  onOpen,
}: {
  composer: React.ReactNode;
  recent: Resource[];
  onPrefill: (prompt: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t, lang } = useLocale();
  return (
    <View style={styles.page}>
      <Label accessibilityRole="header" style={ui.title}>
        {t('greeting')}
      </Label>
      <Label style={[ui.muted, styles.support]}>{t('subtitle')}</Label>
      {composer}
      <View style={styles.chips}>
        {prompts.map(key => (
          <Chip
            key={key}
            label={t(key)}
            onPress={() => onPrefill(t(key + 'Prompt'))}
          />
        ))}
      </View>
      <SectionHeader title={t('recent')} />
      {recent.length === 0 && <EmptyState title={t('emptyRecent')} icon="chats" />}
      {recent.slice(0, 5).map(item => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => onOpen(item.id)}
        >
          <Card>
            <Label>{String(item.data.title || t('newChat'))}</Label>
            {typeof item.data.activityStatus === 'string' && (
              <Label style={ui.badge}>{t(item.data.activityStatus)}</Label>
            )}
            <Label style={[ui.muted, styles.ltr]}>
              {isolate(new Date(item.updatedAt).toLocaleString(lang))}
            </Label>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  support: { fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ltr: { writingDirection: 'ltr' },
});
