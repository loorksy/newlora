import React from 'react';
import { Image, View } from 'react-native';
import { Button, Label, Row, styles } from './UI';
import { useLocale, isolate } from '../i18n';
import type { SelectedFile } from '../services/attachments';
export function Attachments({
  files,
  remove,
  disabled,
}: {
  files: SelectedFile[];
  remove: (index: number) => void;
  disabled: boolean;
}) {
  const { t } = useLocale();
  return (
    <View>
      {files.map((file, i) => (
        <Row key={file.uri}>
          {file.type.startsWith('image/') && (
            <Image
              accessibilityLabel={t('attachmentPreview')}
              source={{ uri: file.uri }}
              style={{ width: 56, height: 56, borderRadius: 8 }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Label numberOfLines={1}>{isolate(file.name)}</Label>
            {file.progress !== undefined && (
              <Label style={styles.muted}>
                {t('uploading')} {file.progress}%
              </Label>
            )}
          </View>
          <Button
            compact
            label={t('removeAttachment')}
            disabled={disabled}
            onPress={() => remove(i)}
          />
        </Row>
      ))}
    </View>
  );
}
