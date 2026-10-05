import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Task } from '@newlora/contracts';
import { useLocale } from '../i18n';
import { space } from '../theme';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { TaskCard } from '../components/TaskCard';
import { Label, styles } from '../components/UI';

const filters = ['all', 'active', 'paused', 'completed', 'failed', 'cancelled'] as const;

export function TasksScreen({
  items,
  filter,
  focus,
  onFilter,
  onPause,
  onCancel,
  onOpen,
}: {
  items: Task[];
  filter: string;
  focus: string | null;
  onFilter: (value: string) => void;
  onPause: (task: Task) => void;
  onCancel: (task: Task) => void;
  onOpen: (sessionId: string) => void;
}) {
  const { t, lang } = useLocale();
  const visible = items.filter(
    task =>
      (!focus || task.id === focus) &&
      (filter === 'all' || task.status === filter),
  );
  return (
    <View style={layout.page}>
      <Label accessibilityRole="header" style={styles.title}>
        {t('tasks')}
      </Label>
      <Label style={styles.muted}>{t('tasksServerNote')}</Label>
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
      {visible.length === 0 && <EmptyState title={t('emptyTasks')} icon="tasks" />}
      {visible.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          language={lang}
          onPause={() => onPause(task)}
          onCancel={() => onCancel(task)}
          onOpen={() => onOpen(task.sessionId)}
        />
      ))}
    </View>
  );
}

const layout = StyleSheet.create({
  page: { gap: space.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
