import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../i18n';
import type { IconName } from '../icons/map';
import { radius, useColors } from '../theme';
import { Icon } from './Icon';

export function StatusBadge({ status }: { status: string }) {
  const { t, rtl } = useLocale();
  const colors = useColors();
  const tones: Record<string, { icon: IconName; color: string }> = {
    active: { icon: 'success', color: colors.success },
    completed: { icon: 'success', color: colors.success },
    updated: { icon: 'success', color: colors.success },
    connected: { icon: 'success', color: colors.success },
    paused: { icon: 'pause', color: colors.secondary },
    draft: { icon: 'info', color: colors.secondary },
    cancelled: { icon: 'close', color: colors.secondary },
    failed: { icon: 'alert', color: colors.danger },
    invalidated: { icon: 'alert', color: colors.danger },
    offline: { icon: 'alert', color: colors.danger },
    queued: { icon: 'activity', color: colors.secondary },
    analyzing: { icon: 'activity', color: colors.secondary },
    waitingSubagents: { icon: 'activity', color: colors.secondary },
  };
  const tone = tones[status] || { icon: 'info' as IconName, color: colors.secondary };
  const label = t(status);
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          direction: rtl ? 'rtl' : 'ltr',
        },
      ]}
    >
      <Icon name={tone.icon} size={14} color={tone.color} />
      <Text
        style={[
          styles.label,
          {
            color: tone.color,
            writingDirection: rtl ? 'rtl' : 'ltr',
            textAlign: rtl ? 'right' : 'left',
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
});
