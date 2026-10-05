import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocale } from '../i18n';
import { colors, space } from '../theme';
import { Icon } from '../components/Icon';
import { Button, Input, Label, Row, styles } from '../components/UI';

export function SignInScreen({
  server,
  password,
  error,
  busy,
  onServer,
  onPassword,
  onSubmit,
  onLanguage,
}: {
  server: string;
  password: string;
  error: string;
  busy: boolean;
  onServer: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onLanguage: (language: 'ar' | 'en') => void;
}) {
  const { t, lang } = useLocale();
  return (
    <View style={layout.page}>
      <Icon name="brand" size={36} color={colors.accent} />
      <Label accessibilityRole="header" style={styles.title}>
        {t('signIn')}
      </Label>
      <Label style={styles.muted}>{t('loginDescription')}</Label>
      <Input
        accessibilityLabel={t('server')}
        placeholder={t('server')}
        value={server}
        onChangeText={onServer}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={layout.ltr}
      />
      <Input
        accessibilityLabel={t('password')}
        placeholder={t('password')}
        secureTextEntry
        value={password}
        onChangeText={onPassword}
      />
      {error !== '' && <Label style={layout.error}>{error}</Label>}
      <Button primary disabled={busy} label={t('signIn')} onPress={onSubmit} />
      <Row>
        <Button
          label={t('arabic')}
          primary={lang === 'ar'}
          onPress={() => onLanguage('ar')}
        />
        <Button
          label={t('english')}
          primary={lang === 'en'}
          onPress={() => onLanguage('en')}
        />
      </Row>
    </View>
  );
}

const layout = StyleSheet.create({
  page: { padding: space.xl, paddingTop: 72, gap: space.lg },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
  error: { color: colors.danger },
});
