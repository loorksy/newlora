import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale, isolate } from '../i18n';
import type { ChatMessage } from '../app/types';
import { radius, useColors } from '../theme';
import { Label, styles as ui } from './UI';

export function ChatBubble({ message }: { message: ChatMessage }) {
  const { t, rtl } = useLocale();
  const colors = useColors();
  const user = message.role === 'user';
  return (
    <View
      testID={user ? 'bubble-user' : 'bubble-assistant'}
      style={[
        user ? styles.user : styles.assistant,
        { alignSelf: user ? 'flex-end' : 'flex-start' },
        user && { backgroundColor: colors.elevated },
      ]}
    >
      <Label
        selectable
        style={[
          user ? styles.userText : styles.assistantText,
          { writingDirection: rtl ? 'rtl' : 'ltr' },
        ]}
      >
        {message.text}
      </Label>
      {!!message.attachmentIds?.length && (
        <Label style={[ui.muted, { color: colors.secondary }]}>
          {t('attachedFiles')} · {message.attachmentIds.length}
        </Label>
      )}
      {!!message.timestamp && (
        <Label style={[ui.muted, styles.time, { color: colors.secondary }]}>
          {isolate(new Date(message.timestamp).toLocaleString())}
        </Label>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  user: {
    maxWidth: '85%',
    borderRadius: radius.floating,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  assistant: {
    maxWidth: '100%',
    width: '100%',
    paddingVertical: 4,
    gap: 4,
  },
  userText: { fontSize: 16, lineHeight: 28 },
  assistantText: { fontSize: 15, lineHeight: 24 },
  time: { writingDirection: 'ltr', fontSize: 12, lineHeight: 16 },
});
