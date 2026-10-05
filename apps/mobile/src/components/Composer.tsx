import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import type { SelectedFile } from '../services/attachments';
import { radius, space, useColors } from '../theme';
import { Attachments } from './Attachments';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Input } from './UI';

export function Composer({
  text,
  onChangeText,
  files,
  busy,
  running,
  hero = false,
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
  hero?: boolean;
  onRemove: (index: number) => void;
  onPickFile: () => void;
  onPickImage: () => void;
  onMic: () => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const { t, rtl } = useLocale();
  const colors = useColors();
  const blocked = files.length >= 4 || busy;
  const canSend = (text.trim().length > 0 || files.length > 0) && !busy;
  const control = hero ? 32 : 36;
  return (
    <View
      testID={hero ? 'composer-hero' : 'composer-thread'}
      style={[
        styles.surface,
        {
          direction: rtl ? 'rtl' : 'ltr',
          borderRadius: hero ? radius.prominent : radius.panel,
          backgroundColor: colors.elevated,
          opacity: busy ? 0.6 : 1,
        },
      ]}
    >
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
          size={control}
          iconSize={16}
        />
        <IconButton
          name="image"
          label={t('image')}
          disabled={blocked}
          onPress={onPickImage}
          color={colors.secondary}
          size={control}
          iconSize={16}
        />
        <IconButton
          name="mic"
          label={t('voice')}
          onPress={onMic}
          color={colors.secondary}
          size={control}
          iconSize={16}
        />
        <View style={{ flex: 1 }} />
        {running ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('stop')}
            onPress={onStop}
            style={[
              styles.round,
              {
                width: control,
                height: control,
                borderRadius: control / 2,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Icon name="stop" size={14} color={colors.text} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('send')}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={onSend}
            style={[
              styles.round,
              {
                width: control,
                height: control,
                borderRadius: control / 2,
                borderColor: colors.primary,
                backgroundColor: colors.primary,
                opacity: canSend ? 1 : 0.4,
              },
            ]}
          >
            <Icon name="arrowUp" size={16} color={colors.primaryForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: 2,
  },
  input: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 44,
    maxHeight: 160,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
