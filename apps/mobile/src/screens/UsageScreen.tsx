import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale, isolate } from '../i18n';
import type { UsageSummary } from '../app/types';
import { radius, space, useColors } from '../theme';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { Button, Card, Input, Label, Row, styles } from '../components/UI';

const ranges = ['today', 'week', 'month', 'custom'] as const;
const groups = [
  ['provider', 'providers'],
  ['model', 'models'],
  ['agent_type', 'subagent'],
  ['session_id', 'chats'],
  ['task_id', 'tasks'],
  ['day', 'days'],
] as const;

function metric(value: number | null | undefined) {
  return typeof value === 'number';
}

export function UsageScreen({
  usage,
  range,
  from,
  to,
  onRange,
  onFrom,
  onTo,
  onApply,
}: {
  usage: UsageSummary | null;
  range: string;
  from: string;
  to: string;
  onRange: (value: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onApply: () => void;
}) {
  const { t, lang, rtl } = useLocale();
  const colors = useColors();
  const known = [
    ['inputTokens', usage?.inputTokens],
    ['outputTokens', usage?.outputTokens],
    ['cacheTokens', usage?.cachedTokens ?? usage?.cacheWriteTokens],
    ['latency', usage?.latencyMs],
  ] as const;
  return (
    <View style={layout.page}>
      <Label accessibilityRole="header" style={styles.title}>
        {t('usage')}
      </Label>
      <View style={layout.filters}>
        {ranges.map(item => (
          <Chip
            key={item}
            label={t(item)}
            selected={range === item}
            onPress={() => onRange(item)}
          />
        ))}
      </View>
      {range === 'custom' && (
        <Card>
          <Input
            accessibilityLabel={t('from')}
            placeholder={t('from')}
            value={from}
            onChangeText={onFrom}
            style={layout.ltr}
          />
          <Input
            accessibilityLabel={t('to')}
            placeholder={t('to')}
            value={to}
            onChangeText={onTo}
            style={layout.ltr}
          />
          <Button label={t('select')} onPress={onApply} />
        </Card>
      )}
      {(!usage || usage.calls === 0) && (
        <EmptyState title={t('emptyUsage')} icon="usage" />
      )}
      {usage && usage.calls > 0 && (
        <>
          <Card>
            <Label style={styles.muted}>{t('tokens')}</Label>
            <Label style={styles.title}>{usage.tokens.toLocaleString(lang)}</Label>
            <Label style={styles.muted}>{t('calls')}</Label>
            <Label>{usage.calls.toLocaleString(lang)}</Label>
            {metric(usage.failedCalls) && (
              <>
                <Label style={styles.muted}>{t('failedCalls')}</Label>
                <Label>{usage.failedCalls!.toLocaleString(lang)}</Label>
              </>
            )}
            <Label style={styles.muted}>{t('cost')}</Label>
            <Label accessibilityLabel={usage.cost === null ? t('unknownCost') : undefined}>
              {usage.cost === null ? '—' : '$' + usage.cost.toFixed(4)}
            </Label>
            {usage.cost === null && <Label style={styles.muted}>{t('unknownCost')}</Label>}
            {known
              .filter(([, value]) => metric(value))
              .map(([key, value]) => (
                <View key={key}>
                  <Label style={styles.muted}>{t(key)}</Label>
                  <Label style={layout.embed}>
                    {isolate(
                      key === 'latency'
                        ? Math.round(value as number) + ' ms'
                        : (value as number).toLocaleString(lang),
                    )}
                  </Label>
                </View>
              ))}
          </Card>
          {groups.map(([group, label]) => {
            const rows = Object.entries(usage.breakdowns[group] || {}).sort(
              (a, b) => b[1] - a[1],
            );
            if (!rows.length) return null;
            const max = rows[0][1] || 1;
            return (
              <Card key={group}>
                <Label>{t(label)}</Label>
                {rows.slice(0, 10).map(([key, value]) => (
                  <View key={key} style={{ gap: 6 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Label numberOfLines={1} style={[styles.muted, layout.embed, { flex: 1 }]}>
                        {isolate(key)}
                      </Label>
                      <Label>{value.toLocaleString(lang)}</Label>
                    </Row>
                    <View style={layout.track}>
                      <View
                        style={{
                          width: `${Math.min(100, (value / max) * 100)}%`,
                          height: 4,
                          backgroundColor: colors.usage,
                          borderRadius: 2,
                          alignSelf: rtl ? 'flex-end' : 'flex-start',
                        }}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            );
          })}
        </>
      )}
    </View>
  );
}

const layout = StyleSheet.create({
  page: { gap: space.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
  embed: { writingDirection: 'ltr' },
  track: {
    height: 4,
    backgroundColor: '#00000014',
    borderRadius: radius.sm,
  },
});
