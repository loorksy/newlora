import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import type { RecommendationResource } from '../app/types';
import { space } from '../theme';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { RecommendationCard } from '../components/RecommendationCard';
import { Label, styles } from '../components/UI';

const filters = [
  'all',
  'draft',
  'active',
  'updated',
  'completed',
  'invalidated',
  'cancelled',
] as const;

export function RecommendationsScreen({
  items,
  filter,
  onFilter,
  onOpen,
}: {
  items: RecommendationResource[];
  filter: string;
  onFilter: (value: string) => void;
  onOpen: (item: RecommendationResource) => void;
}) {
  const { t } = useLocale();
  const visible = items.filter(
    item => filter === 'all' || item.data.status === filter,
  );
  return (
    <View style={layout.page}>
      <Label accessibilityRole="header" style={styles.title}>
        {t('recommendations')}
      </Label>
      <View style={layout.filters}>
        {filters.map(item => (
          <Chip
            key={item}
            label={t(item)}
            selected={filter === item}
            onPress={() => onFilter(item)}
          />
        ))}
      </View>
      {visible.length === 0 && (
        <EmptyState title={t('emptyRecommendations')} icon="recommendations" />
      )}
      {visible.map(item => (
        <RecommendationCard key={item.id} item={item} onOpen={() => onOpen(item)} />
      ))}
    </View>
  );
}

const layout = StyleSheet.create({
  page: { gap: space.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
