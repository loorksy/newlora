import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type {
  Artifact,
  Resource,
  ChartCommand,
  ChartState,
  ChartEvent,
  Candle,
} from '@newlora/contracts';
import { baseURL, id, request } from '../services/api';
import { useLocale } from '../i18n';
import { Label, styles } from './UI';
export function ChartView({ item }: { item: Resource<Artifact> }) {
  const ref = useRef<WebView<object>>(null);
  const { t } = useLocale();
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [timeframe, setTimeframe] = useState(String(item.data.data.timeframe));
  const state = item.data.data as unknown as ChartState;
  const send = (command: ChartCommand) =>
    ref.current?.postMessage(JSON.stringify(command));
  const refresh = async () => {
    try {
      const result = await request<{ candles: Candle[] }>(
        '/market/' +
          encodeURIComponent(state.instrument) +
          '/candles?timeframe=' +
          encodeURIComponent(timeframe),
      );
      send({ id: id(), command: 'loadCandles', payload: result.candles });
      setError('');
    } catch {
      setError(t('oanda_connection_failed'));
    }
  };
  useEffect(() => {
    if (!ready) return;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [ready, timeframe]);
  const message = async (e: WebViewMessageEvent) => {
    let event: ChartEvent;
    try {
      event = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (event.event === 'ready') {
      send({ id: id(), command: 'loadInstrument', payload: state });
      setReady(true);
    }
    if (event.event === 'timeframeChanged' && typeof event.payload === 'string')
      setTimeframe(event.payload);
    if (event.event === 'error') setError(t('chart_rendering_failed'));
  };
  return (
    <View style={{ flex: 1 }}>
      {error !== '' && <Label style={styles.muted}>{error}</Label>}
      <WebView<object>
        ref={ref}
        source={{ uri: baseURL() + '/chart/' }}
        onMessage={e => {
          void message(e);
        }}
        originWhitelist={[baseURL()]}
        onShouldStartLoadWithRequest={r =>
          r.url.startsWith(baseURL() + '/chart/')
        }
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: '#101413' }}
      />
    </View>
  );
}
