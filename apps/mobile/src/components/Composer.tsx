import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import type { SelectedFile } from '../services/attachments';
import { colors, radius, space } from '../theme';
import { Attachments } from './Attachments';
import { IconButton } from './IconButton';
import { Input } from './UI';

export function Composer({
  text,
  onChangeText,
  files,
  busy,
  running,
  onRemove,
  onPickFile,
  onPickImage,
  onMic,
  onSend,
  onStop,
}: {
  text: string;
  onChangeText: (value: string) => void;
  files: SelectedFile[];
  busy: boolean;
  running: boolean;
  onRemove: (index: number) => void;
  onPickFile: () => void;
  onPickImage: () => void;
  onMic: () => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const { t, rtl } = useLocale();
  const blocked = files.length >= 4 || busy;
  return (
    <View style={[styles.panel, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <Attachments files={files} disabled={busy} remove={onRemove} />
      <Input
        multiline
        accessibilityLabel={t('composer')}
        placeholder={t('composer')}
        value={text}
        onChangeText={onChangeText}
        style={styles.input}
      />
      <View style={styles.tools}>
        <IconButton
          name="attach"
          label={t('attach')}
          disabled={blocked}
          onPress={onPickFile}
          color={colors.secondary}
        />
        <IconButton
          name="image"
          label={t('image')}
          disabled={blocked}
          onPress={onPickImage}
          color={colors.secondary}
        />
        <IconButton
          name="mic"
          label={t('voice')}
          onPress={onMic}
          color={colors.secondary}
        />
        <View style={{ flex: 1 }} />
        {running ? (
          <IconButton name="stop" label={t('stop')} onPress={onStop} color={colors.danger} />
        ) : (
          <IconButton
            name="send"
            label={t('send')}
            disabled={(!text.trim() && files.length === 0) || busy}
            onPress={onSend}
            color={colors.accent}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  input: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 72,
    paddingHorizontal: space.sm,
  },
  tools: { flexDirection: 'row', alignItems: 'center' },
});
