import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { OTA_VERIFICATION } from '../ota/diagnostics';
import { space, useColors } from '../theme';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { SectionHeader } from '../components/SectionHeader';
import { Label, styles as ui } from '../components/UI';

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
  const colors = useColors();
  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <Icon name="brand" size={32} color={colors.text} />
        <Label accessibilityRole="header" style={[ui.title, styles.greeting]}>
          {t('greeting')}
        </Label>
        <Label testID="nanobot-ota-proof" style={[styles.proof, { color: colors.text }]}>
          {isolate(OTA_VERIFICATION)}
        </Label>
      </View>
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
      {recent.slice(0, 8).map(item => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => onOpen(item.id)}
          style={[styles.row, { backgroundColor: colors.elevated }]}
        >
          <Label numberOfLines={1}>{String(item.data.title || t('newChat'))}</Label>
          {typeof item.data.activityStatus === 'string' && (
            <Label style={[ui.badge, { color: colors.secondary }]}>
              {t(item.data.activityStatus)}
            </Label>
          )}
          <Label style={[ui.muted, styles.ltr, { color: colors.secondary }]}>
            {isolate(new Date(item.updatedAt).toLocaleString(lang))}
          </Label>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  hero: { alignItems: 'center', gap: 12, paddingTop: 28, paddingBottom: 8 },
  greeting: { fontSize: 34, lineHeight: 37, fontWeight: '400', textAlign: 'center' },
  proof: { fontSize: 13, letterSpacing: 0.6, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  ltr: { writingDirection: 'ltr' },
});
