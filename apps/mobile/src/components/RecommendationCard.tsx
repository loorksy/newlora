import React from 'react';
import { View } from 'react-native';
import { useLocale, isolate } from '../i18n';
import type { RecommendationResource } from '../app/types';
import { Button, Card, Label, Row, styles } from './UI';
import { StatusBadge } from './StatusBadge';

export function RecommendationCard({
  item,
  onOpen,
}: {
  item: RecommendationResource;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const d = item.data;
  const metrics = [
    [t('entry'), d.entry],
    [t('stopLoss'), d.stop],
    ...d.targets.map((n, i) => [t('targets') + ' ' + (i + 1), n]),
  ].filter(pair => pair[1] != null);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label style={[styles.section, ltr]}>{isolate(d.instrument)}</Label>
        <StatusBadge status={d.status} />
      </Row>
      {!!d.direction && <Label style={styles.badge}>{t(d.direction)}</Label>}
      <Label>{d.summary}</Label>
      {metrics.length > 0 && (
        <Row style={{ flexWrap: 'wrap' }}>
          {metrics.map(([key, value]) => (
            <View key={String(key)} style={{ minWidth: 88, flexGrow: 1 }}>
              <Label style={styles.muted}>{key}</Label>
              <Label style={ltr}>{isolate(String(value))}</Label>
            </View>
          ))}
        </Row>
      )}
      {d.timeframes.length > 0 && (
        <Label style={[styles.muted, ltr]}>
          {isolate(d.timeframes.join(' · '))}
        </Label>
      )}
      {!!d.monitoring_task_id && (
        <Label style={styles.badge}>{t('monitored')}</Label>
      )}
      <Button label={t('details')} onPress={onOpen} />
    </Card>
  );
}

const ltr = { writingDirection: 'ltr' as const, textAlign: 'left' as const };
