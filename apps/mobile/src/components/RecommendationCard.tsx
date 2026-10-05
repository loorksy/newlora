import React from 'react';
import { View } from 'react-native';
import type { Recommendation, Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { Card, Label, Row, Button, colors, styles } from './UI';
export function RecommendationCard({
  item,
  onOpen,
}: {
  item: Resource<Recommendation>;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const d = item.data;
  const metrics = [
    [t('entry'), d.entry],
    [t('stopLoss'), d.stop],
    ...d.targets.map((n, i) => [t('targets') + ' ' + (i + 1), n]),
  ];
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label style={{ fontSize: 23, fontWeight: '600' }}>
          {isolate(d.instrument)}
        </Label>
        <Label style={styles.badge}>{t(d.status)}</Label>
      </Row>
      {d.direction && (
        <Label style={{ color: colors.accent }}>{t(d.direction)}</Label>
      )}
      <Label>{d.summary}</Label>
      <Row style={{ flexWrap: 'wrap' }}>
        {metrics
          .filter(x => x[1] != null)
          .map(([key, value]) => (
            <View key={String(key)} style={{ minWidth: 85, flexGrow: 1 }}>
              <Label style={styles.muted}>{key}</Label>
              <Label>{isolate(String(value))}</Label>
            </View>
          ))}
      </Row>
      {d.timeframes.length > 0 && (
        <Label style={styles.muted}>{isolate(d.timeframes.join(' · '))}</Label>
      )}
      {d.monitoring_task_id && (
        <Label style={styles.badge}>{t('monitored')}</Label>
      )}
      <Button label={t('details')} onPress={onOpen} />
    </Card>
  );
}
