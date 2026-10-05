import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Artifact, Resource } from '@newlora/contracts';
import { exportChart } from '../services/files';
import { useLocale } from '../i18n';
import { id, request } from '../services/api';
import { ChartCard } from './ChartCard';
import { Button, Card, Input, Label, Row, styles } from './UI';
export function ArtifactView({
  item,
  onChart,
  onInteraction,
}: {
  item: Resource<Artifact>;
  onChart: (item: Resource<Artifact>) => void;
  onInteraction: () => void;
}) {
  const { t } = useLocale();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportImage = async (save: boolean) => {
    setExporting(true);
    setError('');
    try {
      await exportChart(item.id, save, t('share'));
    } catch {
      setError(t('image_export_failed'));
    } finally {
      setExporting(false);
    }
  };
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<number | null>(null);
  const a = item.data;
  const d = a.data;
  if (a.type === 'chart')
    return (
      <View style={{ gap: 8 }}>
        {error !== '' && <Label>{error}</Label>}
        <ChartCard
          item={item}
          busy={exporting}
          onOpen={() => onChart(item)}
          onSave={() => {
            void exportImage(true);
          }}
          onShare={() => {
            void exportImage(false);
          }}
        />
      </View>
    );
  return (
    <Card>
      {error !== '' && <Label>{error}</Label>}
      <Label style={{ fontWeight: '600' }}>{a.title}</Label>
      {a.type === 'agent_text' && <Label>{String(d.text || '')}</Label>}
      {a.type === 'select_item' &&
        ((d.options as { id: string; label: string }[]) || []).map(option => (
          <Button
            key={option.id}
            label={option.label}
            onPress={() => {
              void request('/artifacts/' + item.id + '/select', 'POST', {
                itemId: option.id,
                clientId: id(),
              })
                .then(onInteraction)
                .catch(() => setError(t('error')));
            }}
          />
        ))}
      {(a.type === 'sheet' || a.type === 'data_table') && (
        <>
          <Input
            placeholder={t('search')}
            value={filter}
            onChangeText={setFilter}
          />
          <ScrollView horizontal>
            <View>
              <Row>
                {(d.columns as string[]).map((c, i) => (
                  <Button
                    key={c}
                    label={c}
                    compact
                    onPress={() => setSort(i)}
                  />
                ))}
              </Row>
              {(d.rows as unknown[][])
                .filter(r =>
                  JSON.stringify(r)
                    .toLowerCase()
                    .includes(filter.toLowerCase()),
                )
                .sort((a, b) =>
                  sort === null
                    ? 0
                    : String(a[sort]).localeCompare(
                        String(b[sort]),
                        undefined,
                        { numeric: true },
                      ),
                )
                .map((r, i) => (
                  <Row key={i}>
                    {r.map((v, j) => (
                      <Label
                        key={j}
                        style={[styles.muted, { minWidth: 110, padding: 8 }]}
                      >
                        {String(v ?? '')}
                      </Label>
                    ))}
                  </Row>
                ))}
            </View>
          </ScrollView>
        </>
      )}
    </Card>
  );
}
