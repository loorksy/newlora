import React from 'react';
import { View } from 'react-native';
import type { Task } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import type { TaskConfigView } from '../app/types';
import { Button, Card, Label, Row, styles } from './UI';
import { StatusBadge } from './StatusBadge';

export function scheduleText(
  config: TaskConfigView,
  t: (key: string) => string,
) {
  if (!config.schedule) return '';
  const key = 'schedule_' + config.schedule;
  const named = t(key);
  const parts = [named === key ? config.schedule : named];
  if (typeof config.interval_seconds === 'number')
    parts.push(
      t('everySeconds').replace('{n}', String(config.interval_seconds)),
    );
  if (config.recurrence) parts.push(isolate(config.recurrence));
  if (config.at) parts.push(isolate(config.at));
  return parts.join(' · ');
}

export function TaskCard({
  task,
  language,
  onPause,
  onCancel,
  onOpen,
}: {
  task: Task;
  language: string;
  onPause: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const config = task.config as TaskConfigView;
  const schedule = scheduleText(config, t);
  const runnable = task.status === 'active' || task.status === 'paused';
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Label>{config.objective}</Label>
          {!!config.instrument && (
            <Label style={[styles.muted, ltr]}>{isolate(config.instrument)}</Label>
          )}
        </View>
        <StatusBadge status={task.status} />
      </Row>
      {schedule !== '' && (
        <Label style={styles.muted}>
          {t('schedule')} · {schedule}
        </Label>
      )}
      {!!task.latestResult && <Label style={styles.muted}>{task.latestResult}</Label>}
      {!!task.latestCheck && (
        <Label style={[styles.muted, ltr]}>
          {t('lastCheck')} · {isolate(new Date(task.latestCheck).toLocaleString(language))}
        </Label>
      )}
      {!!task.nextCheck && (
        <Label style={[styles.muted, ltr]}>
          {t('nextCheck')} · {isolate(new Date(task.nextCheck).toLocaleString(language))}
        </Label>
      )}
      <Row style={{ flexWrap: 'wrap' }}>
        {runnable && (
          <Button
            compact
            label={t(task.status === 'active' ? 'pause' : 'resume')}
            onPress={onPause}
          />
        )}
        {runnable && <Button compact label={t('cancel')} onPress={onCancel} />}
        <Button compact label={t('openChat')} onPress={onOpen} />
      </Row>
    </Card>
  );
}

const ltr = { writingDirection: 'ltr' as const, textAlign: 'left' as const };
