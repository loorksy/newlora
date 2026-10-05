import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Preferences, Provider, Selection } from '@newlora/contracts';
import { useLocale, isolate } from '../i18n';
import { backIcon } from '../icons/map';
import { baseURL, logout, request } from '../services/api';
import { registerPush } from '../services/notifications';
import { space, useTheme } from '../theme';
import { IconButton } from '../components/IconButton';
import { ProviderRow, providerNames } from '../components/ProviderRow';
import { SectionHeader } from '../components/SectionHeader';
import { SettingRow } from '../components/SettingRow';
import { OtaAbout } from '../components/OtaAbout';
import { setSensitive } from '../ota/sensitivity';
import { Button, Input, Label, Row, styles } from '../components/UI';

type Connection = {
  configured: boolean;
  lastFour: string;
  connectionStatus: string;
};
type Catalog = {
  models: { id: string; vision: boolean }[];
  voiceModels: { id: string }[];
  refreshedAt: string;
};
type Panel = Provider | 'oanda' | 'voice' | null;
const providers: Provider[] = ['openai', 'anthropic', 'zai'];

export function SettingsScreen({
  onLanguage,
  onLogout,
}: {
  onLanguage: (lang: 'ar' | 'en') => void;
  onLogout: () => void;
}) {
  const { t, lang, rtl } = useLocale();
  const { name: themeName, setTheme } = useTheme();
  const [panel, setPanel] = useState<Panel>(null);
  const [prefs, setPrefs] = useState<Preferences>({
    language: lang,
    main: null,
    subagent: null,
    voice: null,
  });
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [account, setAccount] = useState('');
  const [environment, setEnvironment] = useState('practice');
  const [catalogs, setCatalogs] = useState<Partial<Record<Provider, Catalog>>>({});
  const [status, setStatus] = useState('');
  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setStatus(t((e as { code?: string }).code || 'error'));
    }
  };
  const load = async () => {
    const data = await request<{
      preferences: Preferences;
      credentials: Record<string, Connection>;
    }>('/settings');
    setPrefs(data.preferences);
    setConnections(data.credentials);
  };
  useEffect(() => {
    void safe(load);
  }, []);
  const update = async (next: Preferences) => {
    await request('/settings/preferences', 'PUT', next);
    setPrefs(next);
    onLanguage(next.language);
    setStatus(t('saved'));
  };
  const statusOf = (name: string) =>
    connections[name]
      ? t(connections[name].connectionStatus) +
        ' · ' +
        isolate('••••' + connections[name].lastFour)
      : t('notConfigured');
  const server = baseURL();
  return (
    <View style={layout.page}>
      <Row>
        {panel && (
          <IconButton
            name={backIcon(rtl)}
            label={t('back')}
            onPress={() => setPanel(null)}
          />
        )}
        <Label accessibilityRole="header" style={styles.title}>
          {panel === 'oanda'
            ? 'OANDA'
            : panel === 'voice'
              ? t('voice')
              : panel
                ? providerNames[panel]
                : t('settings')}
        </Label>
      </Row>
      {status !== '' && (
        <Label accessibilityLiveRegion="polite">{status}</Label>
      )}
      {!panel && (
        <>
          <SectionHeader title={t('connection')} />
          <SettingRow
            icon="activity"
            label={t('connection')}
            value={server ? isolate(server) : t('connected')}
          />
          <SectionHeader title={t('providers')} />
          {providers.map(name => (
            <ProviderRow
              key={name}
              provider={name}
              status={statusOf(name)}
              onPress={() => setPanel(name)}
            />
          ))}
          <SectionHeader title={t('oanda')} />
          <SettingRow
            icon="candles"
            label="OANDA"
            value={statusOf('oanda')}
            onPress={() => setPanel('oanda')}
          />
          <SectionHeader title={t('language')} />
          <Row>
            <Button
              label={t('arabic')}
              primary={lang === 'ar'}
              onPress={() => {
                void safe(() => update({ ...prefs, language: 'ar' }));
              }}
            />
            <Button
              label={t('english')}
              primary={lang === 'en'}
              onPress={() => {
                void safe(() => update({ ...prefs, language: 'en' }));
              }}
            />
          </Row>
          <SectionHeader title={t('appearance')} />
          <Row>
            <Button
              label={t('light')}
              primary={themeName === 'light'}
              onPress={() => setTheme('light')}
            />
            <Button
              label={t('dark')}
              primary={themeName === 'dark'}
              onPress={() => setTheme('dark')}
            />
          </Row>
          <SectionHeader title={t('notifications')} />
          <Button
            label={t('notifications')}
            onPress={() => {
              void safe(async () => {
                await registerPush(lang);
                setStatus(t('saved'));
              });
            }}
          />
          <SectionHeader title={t('voice')} />
          <SettingRow
            icon="voice"
            label={t('voiceModel')}
            value={prefs.voice ? isolate(prefs.voice.model) : t('selectModel')}
            onPress={() => setPanel('voice')}
          />
          <SectionHeader title={t('about')} />
          <Label style={styles.muted}>{t('aboutBody')}</Label>
          <OtaAbout />
          <Label style={styles.muted}>{t('security')}</Label>
          <Button
            label={t('signOut')}
            onPress={() => {
              void logout().then(onLogout);
            }}
          />
        </>
      )}
      {panel && panel !== 'voice' && (
        <CredentialEditor
          name={panel}
          connection={connections[panel]}
          secret={keys[panel] || ''}
          account={account}
          environment={environment}
          onSecret={value => setKeys({ ...keys, [panel]: value })}
          onAccount={setAccount}
          onEnvironment={setEnvironment}
          onSave={() => {
            setSensitive('credentials', true);
            void safe(async () => {
              await request('/settings/credentials/' + panel, 'PUT', {
                key: keys[panel],
                ...(panel === 'oanda' ? { account, environment } : {}),
              });
              setKeys({ ...keys, [panel]: '' });
              setAccount('');
              await load();
              setStatus(t('saved'));
            }).finally(() => setSensitive('credentials', false));
          }}
          onTest={() => {
            setSensitive('credentials', true);
            void safe(async () => {
              await request('/settings/credentials/' + panel + '/test', 'POST');
              await load();
            }).finally(() => setSensitive('credentials', false));
          }}
          onDelete={() => {
            setSensitive('credentials', true);
            void safe(async () => {
              await request('/settings/credentials/' + panel, 'DELETE');
              await load();
            }).finally(() => setSensitive('credentials', false));
          }}
          onRefresh={
            panel === 'oanda'
              ? undefined
              : () => {
                  void safe(async () => {
                    const catalog = await request<Catalog>(
                      '/models/' + panel + '?refresh=true',
                    );
                    setCatalogs({ ...catalogs, [panel]: catalog });
                  });
                }
          }
        />
      )}
      {panel && panel !== 'oanda' && panel !== 'voice' && (
        <ModelPicker
          provider={panel}
          catalog={catalogs[panel]}
          prefs={prefs}
          onSelect={(role, model) => {
            void safe(() =>
              update({
                ...prefs,
                [role]: { provider: panel, model } as Selection,
              }),
            );
          }}
        />
      )}
      {panel === 'voice' && (
        <View style={layout.gap}>
          <Button
            label={t('refreshModels')}
            onPress={() => {
              void safe(async () => {
                const catalog = await request<Catalog>(
                  '/models/openai?refresh=true',
                );
                setCatalogs({ ...catalogs, openai: catalog });
              });
            }}
          />
          {!catalogs.openai && <Label style={styles.muted}>{t('noModels')}</Label>}
          {catalogs.openai?.voiceModels.map(model => (
            <Button
              key={model.id}
              label={isolate(model.id)}
              primary={prefs.voice?.model === model.id}
              onPress={() => {
                void safe(() =>
                  update({
                    ...prefs,
                    voice: { provider: 'openai', model: model.id },
                  }),
                );
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function CredentialEditor({
  name,
  connection,
  secret,
  account,
  environment,
  onSecret,
  onAccount,
  onEnvironment,
  onSave,
  onTest,
  onDelete,
  onRefresh,
}: {
  name: string;
  connection?: Connection;
  secret: string;
  account: string;
  environment: string;
  onSecret: (value: string) => void;
  onAccount: (value: string) => void;
  onEnvironment: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
  onDelete: () => void;
  onRefresh?: () => void;
}) {
  const { t } = useLocale();
  return (
    <View style={layout.gap}>
      <Label style={styles.muted}>
        {connection
          ? t(connection.connectionStatus) +
            ' · ' +
            isolate('••••' + connection.lastFour)
          : t('notConfigured')}
      </Label>
      <Input
        accessibilityLabel={t('apiKey')}
        placeholder={t('apiKey')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={secret}
        onChangeText={onSecret}
        style={layout.ltr}
      />
      {name === 'oanda' && (
        <>
          <Input
            accessibilityLabel={t('account')}
            placeholder={t('account')}
            value={account}
            onChangeText={onAccount}
            style={layout.ltr}
          />
          <Row>
            {(['practice', 'live'] as const).map(item => (
              <Button
                key={item}
                label={t(item)}
                primary={environment === item}
                onPress={() => onEnvironment(item)}
              />
            ))}
          </Row>
        </>
      )}
      <Row style={{ flexWrap: 'wrap' }}>
        <Button
          primary
          label={t(connection ? 'replace' : 'save')}
          disabled={!secret || (name === 'oanda' && !account)}
          onPress={onSave}
        />
        <Button label={t('test')} disabled={!connection} onPress={onTest} />
        <Button label={t('delete')} disabled={!connection} onPress={onDelete} />
      </Row>
      {onRefresh && <Button label={t('refreshModels')} onPress={onRefresh} />}
      <Label style={styles.muted}>{t('security')}</Label>
    </View>
  );
}

function ModelPicker({
  provider,
  catalog,
  prefs,
  onSelect,
}: {
  provider: Provider;
  catalog?: Catalog;
  prefs: Preferences;
  onSelect: (role: 'main' | 'subagent', model: string) => void;
}) {
  const { t } = useLocale();
  return (
    <View style={layout.gap}>
      {!catalog && <Label style={styles.muted}>{t('noModels')}</Label>}
      {(['main', 'subagent'] as const).map(role => (
        <View key={role} style={layout.gap}>
          <Label>
            {t(role === 'main' ? 'mainModel' : 'subagentModel')}
          </Label>
          <Label style={styles.muted}>
            {prefs[role]?.provider === provider
              ? isolate(prefs[role]!.model)
              : t('selectModel')}
          </Label>
          {catalog?.models.map(model => (
            <Button
              key={role + model.id}
              label={isolate(model.id)}
              primary={prefs[role]?.model === model.id && prefs[role]?.provider === provider}
              onPress={() => onSelect(role, model.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const layout = StyleSheet.create({
  page: { gap: space.lg },
  gap: { gap: space.md },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
});
