import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale, isolate } from '../i18n';
import type {
  ActivityItem,
  ArtifactResource,
  ChatMessage,
  RecommendationResource,
} from '../app/types';
import { space } from '../theme';
import { AgentActivity } from '../components/AgentActivity';
import { ArtifactView } from '../components/ArtifactView';
import { ChatBubble } from '../components/ChatBubble';
import { RecommendationCard } from '../components/RecommendationCard';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Label, Row, styles } from '../components/UI';

export function ChatContextBar({
  instrument,
  timeframe,
  onChart,
}: {
  instrument: string;
  timeframe: string;
  onChart: () => void;
}) {
  const { t } = useLocale();
  if (!instrument && !timeframe) return null;
  return (
    <Row style={bar.row}>
      <Label style={[styles.muted, bar.ltr]}>
        {isolate([instrument, timeframe].filter(Boolean).join(' · '))}
      </Label>
      <Button compact label={t('chart')} onPress={onChart} />
    </Row>
  );
}

export function ChatScreen({
  messages,
  stream,
  activity,
  runState,
  leaveNotice,
  artifacts,
  recommendations,
  onOpenRecommendation,
  onChart,
  onInteraction,
}: {
  messages: ChatMessage[];
  stream: string;
  activity: ActivityItem[];
  runState: string;
  leaveNotice: boolean;
  artifacts: ArtifactResource[];
  recommendations: RecommendationResource[];
  onOpenRecommendation: (item: RecommendationResource) => void;
  onChart: (item: ArtifactResource) => void;
  onInteraction: () => void;
}) {
  const { t, rtl } = useLocale();
  return (
    <View style={[bar.page, { direction: rtl ? 'rtl' : 'ltr' }]}>
      {messages.map(message => (
        <ChatBubble key={message.clientId} message={message} />
      ))}
      {stream !== '' && <Label selectable>{stream}</Label>}
      {runState !== '' && <StatusBadge status={runState} />}
      {leaveNotice && <Label style={styles.muted}>{t('mayLeave')}</Label>}
      <AgentActivity items={activity} />
      {recommendations.map(item => (
        <RecommendationCard
          key={item.id}
          item={item}
          onOpen={() => onOpenRecommendation(item)}
        />
      ))}
      {artifacts.map(item => (
        <ArtifactView
          key={item.id}
          item={item}
          onChart={onChart}
          onInteraction={onInteraction}
        />
      ))}
    </View>
  );
}

const bar = StyleSheet.create({
  page: { gap: space.lg },
  row: {
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    justifyContent: 'space-between',
  },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
});
