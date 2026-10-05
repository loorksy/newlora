import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale, isolate } from '../i18n';
import type { ChatMessage } from '../app/types';
import { colors, radius, space } from '../theme';
import { Label, styles as ui } from './UI';

export function ChatBubble({ message }: { message: ChatMessage }) {
  const { t, rtl } = useLocale();
  const user = message.role === 'user';
  return (
    <View
      testID={user ? 'bubble-user' : 'bubble-assistant'}
      style={[
        user ? styles.user : styles.assistant,
        { alignSelf: user ? 'flex-end' : 'flex-start' },
      ]}
    >
      {!user && <Label style={ui.badge}>{t('brand')}</Label>}
      <Label selectable style={{ writingDirection: rtl ? 'rtl' : 'ltr' }}>
        {message.text}
      </Label>
      {!!message.attachmentIds?.length && (
        <Label style={ui.muted}>
          {t('attachedFiles')} · {message.attachmentIds.length}
        </Label>
      )}
      {!!message.timestamp && (
        <Label style={[ui.muted, styles.time]}>
          {isolate(new Date(message.timestamp).toLocaleString())}
        </Label>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  user: {
    maxWidth: '88%',
    backgroundColor: colors.strong,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  assistant: {
    maxWidth: '100%',
    paddingVertical: space.sm,
    gap: space.sm,
  },
  time: { writingDirection: 'ltr' },
});
