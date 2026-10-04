import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Preferences, Provider, Selection } from '@newlora/contracts';
import OpenAI from '../vendor/lobe/OpenAI';
import Anthropic from '../vendor/lobe/Anthropic';
import ZAI from '../vendor/lobe/ZAI';
import { request, logout } from '../services/api';
import { useLocale, isolate } from '../i18n';
import { registerPush } from '../services/notifications';
import { Button, Card, Input, Label, Row, styles } from './UI';
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
function ProviderIcon({ name }: { name: string }) {
  if (name === 'openai') return <OpenAI size={24} color="#eeeeee" />;
  if (name === 'anthropic') return <Anthropic size={24} color="#eeeeee" />;
  if (name === 'zai') return <ZAI size={24} color="#eeeeee" />;
  return null;
}
export function SettingsView({
  onLanguage,
  onLogout,
}: {
  onLanguage: (lang: 'ar' | 'en') => void;
  onLogout: () => void;
}) {
  const { t, lang } = useLocale();
  const [prefs, setPrefs] = useState<Preferences>({
    language: lang,
    main: null,
    subagent: null,
    voice: null,
  });
  const [connections, setConnections] = useState<Record<string, Connection>>(
    {},
  );
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [account, setAccount] = useState('');
  const [environment, setEnvironment] = useState('practice');
  const [catalogs, setCatalogs] = useState<Partial<Record<Provider, Catalog>>>(
    {},
  );
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
  return (
    <View style={{ gap: 18 }}>
      <Label style={styles.title}>{t('settings')}</Label>
      {status !== '' && (
        <Label accessibilityLiveRegion="polite">{status}</Label>
      )}
      <Card>
        <Label>{t('language')}</Label>
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
      </Card>
      <Label style={styles.muted}>{t('security')}</Label>
      {['oanda', 'openai', 'anthropic', 'zai'].map(name => (
        <Card key={name}>
          <Row>
            <ProviderIcon name={name} />
            <Label style={{ fontSize: 20, fontWeight: '600' }}>
              {name === 'oanda'
                ? 'OANDA'
                : name === 'zai'
                ? 'Z.AI'
                : name === 'openai'
                ? 'OpenAI'
                : 'Anthropic'}
            </Label>
          </Row>
          <Label style={styles.muted}>
            {connections[name]
              ? t(connections[name].connectionStatus) +
                ' · ' +
                isolate('••••' + connections[name].lastFour)
              : t('notConfigured')}
          </Label>
          <Input
            accessibilityLabel={t('apiKey')}
            placeholder={t('apiKey')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={keys[name] || ''}
            onChangeText={value => setKeys({ ...keys, [name]: value })}
          />
          {name === 'oanda' && (
            <>
              <Input
                placeholder={t('account')}
                value={account}
                onChangeText={setAccount}
                style={{ writingDirection: 'ltr' }}
              />
              <Row>
                {['practice', 'live'].map(e => (
                  <Button
                    key={e}
                    label={t(e)}
                    primary={environment === e}
                    onPress={() => setEnvironment(e)}
                  />
                ))}
              </Row>
            </>
          )}
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              primary
              label={t(connections[name] ? 'replace' : 'save')}
              disabled={!keys[name] || (name === 'oanda' && !account)}
              onPress={() => {
                void safe(async () => {
                  await request('/settings/credentials/' + name, 'PUT', {
                    key: keys[name],
                    ...(name === 'oanda' ? { account, environment } : {}),
                  });
                  setKeys({ ...keys, [name]: '' });
                  await load();
                });
              }}
            />
            <Button
              label={t('test')}
              disabled={!connections[name]}
              onPress={() => {
                void safe(async () => {
                  await request(
                    '/settings/credentials/' + name + '/test',
                    'POST',
                  );
                  await load();
                });
              }}
            />
            <Button
              label={t('delete')}
              disabled={!connections[name]}
              onPress={() => {
                void safe(async () => {
                  await request('/settings/credentials/' + name, 'DELETE');
                  await load();
                });
              }}
            />
          </Row>
          {name !== 'oanda' && connections[name] && (
            <Button
              label={t('refreshModels')}
              onPress={() => {
                void safe(async () => {
                  const c = await request<Catalog>(
                    '/models/' + name + '?refresh=true',
                  );
                  setCatalogs({ ...catalogs, [name]: c });
                });
              }}
            />
          )}
        </Card>
      ))}
      {(['main', 'subagent', 'voice'] as const).map(role => (
        <Card key={role}>
          <Label>
            {t(
              role === 'main'
                ? 'mainModel'
                : role === 'subagent'
                ? 'subagentModel'
                : 'voiceModel',
            )}
          </Label>
          <Label style={styles.muted}>
            {prefs[role] ? isolate(prefs[role]!.model) : t('selectModel')}
          </Label>
          {(role === 'voice' ? ['openai'] : ['openai', 'anthropic', 'zai']).map(
            name => {
              const c = catalogs[name as Provider];
              return (
                <View key={name} style={{ gap: 8 }}>
                  {c &&
                    (role === 'voice' ? c.voiceModels : c.models).map(m => (
                      <Button
                        key={m.id}
                        label={isolate(m.id)}
                        primary={prefs[role]?.model === m.id}
                        onPress={() => {
                          void safe(() =>
                            update({
                              ...prefs,
                              [role]: {
                                provider: name,
                                model: m.id,
                              } as Selection,
                            }),
                          );
                        }}
                      />
                    ))}
                </View>
              );
            },
          )}
        </Card>
      ))}
      <Button
        label={t('notifications')}
        onPress={() => {
          void safe(async () => {
            await registerPush(lang);
            setStatus(t('saved'));
          });
        }}
      />
      <Button
        label={t('signOut')}
        onPress={() => {
          void logout().then(onLogout);
        }}
      />
    </View>
  );
}
