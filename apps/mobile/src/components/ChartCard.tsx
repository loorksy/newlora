import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocale, isolate } from '../i18n';
import type { ArtifactResource } from '../app/types';
import { authHeaders, baseURL } from '../services/api';
import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { Button, Card, Label, Row, styles as ui } from './UI';

export function chartCaption(data: Record<string, unknown>) {
  const instrument = typeof data.instrument === 'string' ? data.instrument : '';
  const timeframe = typeof data.timeframe === 'string' ? data.timeframe : '';
  return [instrument, timeframe].filter(Boolean).join(' · ');
}

export function ChartCard({
  item,
  busy,
  onOpen,
  onSave,
  onShare,
}: {
  item: ArtifactResource;
  busy: boolean;
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const { t, rtl } = useLocale();
  const caption = chartCaption(item.data.data);
  return (
    <Card>
      <Row>
        <Icon name="candles" color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Label style={styles.title}>{item.data.title}</Label>
          {caption !== '' && (
            <Label style={[ui.muted, styles.ltr]}>{isolate(caption)}</Label>
          )}
        </View>
      </Row>
      <Image
        accessibilityLabel={t('attachedChart')}
        source={{
          uri: baseURL() + '/artifacts/' + item.id + '/image',
          headers: authHeaders(),
        }}
        style={[styles.image, { direction: rtl ? 'rtl' : 'ltr' }]}
        resizeMode="contain"
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <Button label={t('chart')} onPress={onOpen} />
        <Button label={t('save')} disabled={busy} onPress={onSave} />
        <Button label={t('share')} disabled={busy} onPress={onShare} />
      </Row>
    </Card>
  );
}

export function ChartFrame({
  title,
  caption,
  onClose,
  children,
}: {
  title: string;
  caption: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t, rtl } = useLocale();
  return (
    <View style={[styles.frame, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <Row style={styles.frameBar}>
        <Button compact label={t('close')} onPress={onClose} />
        <View style={{ flex: 1 }}>
          <Label numberOfLines={1}>{title}</Label>
          {caption !== '' && (
            <Label style={[ui.muted, styles.ltr]}>{isolate(caption)}</Label>
          )}
        </View>
      </Row>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '600' },
  ltr: { writingDirection: 'ltr' },
  image: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  frame: { flex: 1, backgroundColor: colors.bg },
  frameBar: { padding: space.lg, gap: space.md },
});
