import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import type { Artifact, Recommendation, Resource } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { request } from '../services/api';
import { Button, Card, Label, Row, styles } from './UI';
export function RecommendationDetail({
  item,
  onChat,
  onTask,
  onChart,
}: {
  item: Resource<Recommendation>;
  onChat: (id: string) => void;
  onTask: () => void;
  onChart: (item: Resource<Artifact>) => void;
}) {
  const { t, lang } = useLocale();
  const [timeline, setTimeline] = useState<Resource[]>([]);
  const [market, setMarket] = useState<{
    tradeable: boolean;
    asOf: string;
    bids: { price: string }[];
    asks: { price: string }[];
  } | null>(null);
  const [error, setError] = useState('');
  const d = item.data;
  useEffect(() => {
    void Promise.all([
      request<Resource<Recommendation> & { timeline: Resource[] }>(
        '/resource/' + item.id,
      ),
      request<typeof market>(
        '/market/' + encodeURIComponent(d.instrument) + '/price',
      ),
    ])
      .then(([detail, price]) => {
        setTimeline(detail.timeline);
        setMarket(price);
      })
      .catch(e => setError(t(e.code || 'error')));
  }, [item.id]);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Label style={styles.title}>{isolate(d.instrument)}</Label>
      <Label>
        {t(d.status)}
        {d.direction ? ' · ' + t(d.direction) : ''}
      </Label>
      <Label>{d.summary}</Label>
      {d.rationale_summary && <Label>{d.rationale_summary}</Label>}
      <Row style={{ flexWrap: 'wrap' }}>
        {[
          [t('entry'), d.entry],
          [t('stopLoss'), d.stop],
          ...d.targets.map((v, i) => [t('targets') + ' ' + (i + 1), v]),
        ]
          .filter(v => v[1] != null)
          .map(([key, value]) => (
            <Card key={String(key)}>
              <Label style={styles.muted}>{key}</Label>
              <Label>{isolate(String(value))}</Label>
            </Card>
          ))}
      </Row>
      {market && (
        <Card>
          <Label>{t(market.tradeable ? 'tradeable' : 'marketClosed')}</Label>
          <Label style={styles.muted}>
            {new Date(market.asOf).toLocaleString(lang)}
          </Label>
          <Label>
            {isolate(
              (market.bids[0]?.price || '') +
                ' / ' +
                (market.asks[0]?.price || ''),
            )}
          </Label>
        </Card>
      )}
      {error !== '' && <Label>{error}</Label>}
      {d.chart_artifact_id && (
        <Button
          label={t('chart')}
          onPress={() => {
            void request<Resource<Artifact>>('/resource/' + d.chart_artifact_id)
              .then(onChart)
              .catch(e => setError(t(e.code || 'error')));
          }}
        />
      )}
      {d.monitoring_task_id && <Button label={t('tasks')} onPress={onTask} />}
      <Button label={t('openChat')} onPress={() => onChat(item.sessionId!)} />
      {timeline.map(change => (
        <Card key={change.id}>
          <Label style={styles.muted}>
            {new Date(change.createdAt).toLocaleString(lang)}
          </Label>
          <Label>
            {String((change.data.after as Recommendation)?.summary || '')}
          </Label>
        </Card>
      ))}
    </ScrollView>
  );
}
