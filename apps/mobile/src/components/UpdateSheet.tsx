import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { colors, space } from '../theme';
import { Button, Card, Label, styles } from './UI';
import { Icon } from './Icon';

export function UpdateSheet({
  visible,
  reduceMotion,
  onUpdate,
}: {
  visible: boolean;
  reduceMotion: boolean;
  onUpdate: () => void;
}) {
  const { t } = useLocale();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => {}}
    >
      <View style={layout.backdrop}>
        <Card>
          <Icon name="refresh" color={colors.accent} size={28} />
          <Label accessibilityRole="header" style={styles.section}>
            {t('otaUpdatedTitle')}
          </Label>
          <Label style={styles.muted}>{t('otaUpdatedBody')}</Label>
          <Button primary label={t('otaNow')} onPress={onUpdate} />
        </Card>
      </View>
    </Modal>
  );
}

const layout = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xxl,
    backgroundColor: '#000000aa',
  },
});
