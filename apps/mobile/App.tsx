import { RecommendationDetail } from './src/components/RecommendationDetail';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type {
  Artifact,
  EventEnvelope,
  Preferences,
  Recommendation,
  Resource,
  Task,
} from '@newlora/contracts';
import { LocaleContext, useLocale, isolate, type Language } from './src/i18n';
import {
  APIError,
  id,
  login,
  request,
  restore,
  subscribe,
} from './src/services/api';
import {
  foregroundNotifications,
  initialNotification,
} from './src/services/notifications';
import {
  Button,
  Card,
  Input,
  Label,
  Row,
  colors,
  styles,
} from './src/components/UI';
import { RecommendationCard } from './src/components/RecommendationCard';
import { ArtifactView } from './src/components/ArtifactView';
import { ChartView } from './src/components/ChartView';
import { SettingsView } from './src/components/SettingsView';
import { CallView } from './src/components/CallView';

type Screen =
  | 'welcome'
  | 'chats'
  | 'recommendations'
  | 'tasks'
  | 'usage'
  | 'settings';
type Message = {
  id?: number;
  clientId: string;
  role: string;
  text: string;
  timestamp?: string;
};
type History = {
  activeRunId?: string | null;
  messages: Message[];
  resources: Resource[];
};
type Usage = {
  tokens: number;
  cost: number | null;
  calls: number;
  breakdowns: Record<string, Record<string, number>>;
};
const sections: Screen[] = [
  'welcome',
  'chats',
  'recommendations',
  'tasks',
  'usage',
  'settings',
];

function Application({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (l: Language) => void;
}) {
  const { t, rtl } = useLocale();
  const [signed, setSigned] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [server, setServer] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState<Screen>('welcome');
  const [drawer, setDrawer] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<string | null>(null);
  const [run, setRun] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Resource<Artifact>[]>([]);
  const [chatRecs, setChatRecs] = useState<Resource<Recommendation>[]>([]);
  const [conversations, setConversations] = useState<Resource[]>([]);
  const [recs, setRecs] = useState<Resource<Recommendation>[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [chart, setChart] = useState<Resource<Artifact> | null>(null);
  const [chartContext, setChartContext] = useState<{
    instrument: string;
    timeframe: string;
    artifactId: string;
  } | null>(null);
  const [callSession, setCallSession] = useState<string | undefined>();
  const [call, setCall] = useState<'outgoing' | 'incoming' | null>(null);
  const [detail, setDetail] = useState<Resource<Recommendation> | null>(null);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [stream, setStream] = useState('');
  const safe = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(t((e as APIError).code || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const loadHistory = useCallback(async (s: string) => {
    const h = await request<History>('/conversations/' + s);
    setMessages(h.messages);
    setRun(h.activeRunId || null);
    setArtifacts(
      h.resources.filter(r => r.type === 'artifact') as Resource<Artifact>[],
    );
    setChatRecs(
      h.resources.filter(
        r => r.type === 'recommendation',
      ) as Resource<Recommendation>[],
    );
    const charts = h.resources.filter(
      r => r.type === 'artifact' && r.data.type === 'chart',
    );
    if (charts.length) {
      const latest = charts[charts.length - 1] as Resource<Artifact>;
      const d = latest.data.data;
      setChartContext({
        instrument: String(d.instrument),
        timeframe: String(d.timeframe),
        artifactId: latest.id,
      });
    }
  }, []);
  const openConversation = async (s: string) => {
    setSession(s);
    setScreen('chats');
    setRun(null);
    setActivity([]);
    setChartContext(null);
    await loadHistory(s);
  };
  useEffect(() => {
    void restore()
      .then(async ok => {
        setSigned(ok);
        if (ok) {
          const data = await request<{ preferences: Preferences }>('/settings');
          setLanguage(data.preferences.language);
        }
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, []);
  useEffect(() => {
    if (!signed) return;
    const receiveCall = (url: string) => {
      const match = url.match(/[?&]session=([^&]*)/);
      setCallSession(match?.[1] ? decodeURIComponent(match[1]) : undefined);
      setCall('incoming');
    };
    const listener = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('newlora://call/')) receiveCall(url);
      else if (url.startsWith('newlora://chat/'))
        void safe(() =>
          openConversation(decodeURIComponent(url.split('/').pop()!)),
        );
    });
    void Linking.getInitialURL().then(url => {
      if (url?.startsWith('newlora://call/')) receiveCall(url);
      if (url?.startsWith('newlora://chat/'))
        void safe(() =>
          openConversation(decodeURIComponent(url.split('/').pop()!)),
        );
    });
    let off: (() => void) | undefined;
    try {
      off = foregroundNotifications(language);
      void initialNotification().catch(() => {});
    } catch {
      /* Firebase setup is optional until credentials are supplied. */
    }
    return () => {
      listener.remove();
      off?.();
    };
  }, [signed, language]);
  useEffect(() => {
    if (!session || !signed) return;
    return subscribe(
      session,
      (e: EventEnvelope) => {
        if (e.event === 'agent.activity') {
          const a = e.payload;
          const key = String(a.tool || a.type);
          const label =
            t(key) +
            (a.instrument ? ' · ' + isolate(String(a.instrument)) : '');
          setActivity(previous => [...previous.slice(-4), label]);
        } else if (e.event === 'chat.stream.started') {
          setStream('');
        } else if (e.event === 'chat.delta') {
          setStream(prev => prev + String(e.payload.text || ''));
        } else if (e.event === 'chat.message') {
          setStream('');
          void loadHistory(session);
        } else if (e.event === 'resource.updated') {
          void loadHistory(session);
        } else if (e.event === 'chart.context') {
          setChartContext(
            e.payload as {
              instrument: string;
              timeframe: string;
              artifactId: string;
            },
          );
        } else if (e.event.startsWith('run.')) {
          setRun(null);
          setStream('');
          if (e.event === 'run.failed')
            setError(t(String(e.payload.code || 'error')));
          void loadHistory(session);
        }
      },
      () => setError(t('networkError')),
    );
  }, [session, signed, language, loadHistory]);
  const load = async () => {
    if (screen === 'chats' && !session)
      setConversations(
        await request<Resource[]>(
          '/conversations?q=' + encodeURIComponent(search),
        ),
      );
    if (screen === 'recommendations')
      setRecs(
        await request<Resource<Recommendation>[]>('/resources/recommendation'),
      );
    if (screen === 'tasks') setTasks(await request<Task[]>('/tasks'));
    if (screen === 'usage') {
      const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
      const start =
        range === 'custom'
          ? new Date(from).toISOString()
          : new Date(Date.now() - days * 86400000).toISOString();
      const end =
        range === 'custom'
          ? new Date(to + 'T23:59:59Z').toISOString()
          : new Date().toISOString();
      setUsage(
        await request<Usage>(
          '/usage?start=' +
            encodeURIComponent(start) +
            '&end=' +
            encodeURIComponent(end),
        ),
      );
    }
  };
  useEffect(() => {
    if (signed && range !== 'custom') void safe(load);
  }, [screen, session, signed, range]);
  const send = async (value = text) => {
    if (!value.trim()) return;
    let s = session;
    if (!s) {
      const row = await request<Resource>('/conversations', 'POST', {
        title: '',
      });
      s = row.id;
      setSession(s);
    }
    setScreen('chats');
    const clientId = id();
    const result = await request<{ runId: string }>(
      '/conversations/' + s + '/messages',
      'POST',
      { clientId, text: value },
    );
    setRun(result.runId);
    setText('');
    setActivity([]);
    setMessages(prev => [...prev, { clientId, role: 'user', text: value }]);
  };
  const navigate = (s: Screen) => {
    setScreen(s);
    setDrawer(false);
    setFilter('all');
    if (s === 'welcome' || s === 'chats') {
      setSession(null);
      setMessages([]);
      setChartContext(null);
      setArtifacts([]);
      setChatRecs([]);
      setRun(null);
    }
  };
  const openChart = async () => {
    if (chartContext) {
      const a = await request<Resource<Artifact>>(
        '/resource/' + chartContext.artifactId,
      );
      setChart(a);
    }
  };
  const composer = (
    <Card style={{ padding: 12, borderRadius: 24 }}>
      <Input
        multiline
        accessibilityLabel={t('composer')}
        placeholder={t('composer')}
        value={text}
        onChangeText={setText}
        style={{
          borderWidth: 0,
          padding: 8,
          minHeight: 70,
          backgroundColor: 'transparent',
        }}
      />
      <Row style={{ justifyContent: 'space-between' }}>
        <Button
          compact
          label={t('voice')}
          onPress={() => setCall('outgoing')}
        />
        {run ? (
          <Button
            label={t('stop')}
            onPress={() => {
              void safe(async () => {
                await request('/runs/' + run + '/stop', 'POST');
                setRun(null);
              });
            }}
          />
        ) : (
          <Button
            primary
            label={t('send')}
            disabled={!text.trim() || busy}
            onPress={() => {
              void safe(() => send());
            }}
          />
        )}
      </Row>
    </Card>
  );
  if (restoring)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  if (!signed)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: 80 }]}>
          <Label style={styles.badge}>NEWLORA</Label>
          <Label style={styles.title}>{t('signIn')}</Label>
          <Label style={styles.muted}>{t('loginDescription')}</Label>
          <Input
            accessibilityLabel={t('server')}
            placeholder={t('server')}
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            keyboardType="url"
            style={{ writingDirection: 'ltr', textAlign: 'left' }}
          />
          <Input
            accessibilityLabel={t('password')}
            placeholder={t('password')}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error !== '' && (
            <Label style={{ color: colors.danger }}>{error}</Label>
          )}
          <Button
            primary
            disabled={busy}
            label={t('signIn')}
            onPress={() => {
              void safe(async () => {
                await login(server.trim().replace(/\/$/, ''), password);
                setPassword('');
                setSigned(true);
              });
            }}
          />
          <Row>
            <Button label={t('arabic')} onPress={() => setLanguage('ar')} />
            <Button label={t('english')} onPress={() => setLanguage('en')} />
          </Row>
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <Row
        style={{
          paddingHorizontal: 20,
          paddingVertical: 10,
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('menu')}
          onPress={() => setDrawer(true)}
          style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}
        >
          <Label style={{ fontSize: 25 }}>☰</Label>
        </Pressable>
        <Label style={{ fontSize: 21, fontWeight: '600', letterSpacing: 0.2 }}>
          {t('brand')}
        </Label>
        <View style={{ width: 48 }} />
      </Row>
      {screen === 'chats' && session && chartContext && (
        <Row
          style={{
            paddingHorizontal: 22,
            paddingVertical: 10,
            justifyContent: 'space-between',
          }}
        >
          <Label style={styles.muted}>
            {isolate(chartContext.instrument + ' · ' + chartContext.timeframe)}
          </Label>
          <Button
            compact
            label={t('chart')}
            onPress={() => {
              void safe(openChart);
            }}
          />
        </Row>
      )}
      {error !== '' && (
        <Row style={{ paddingHorizontal: 22, paddingVertical: 10 }}>
          <Label style={{ color: colors.danger, flex: 1 }}>{error}</Label>
          <Button
            compact
            label={t('retry')}
            onPress={() => {
              void safe(session ? () => loadHistory(session) : load);
            }}
          />
        </Row>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          {screen === 'welcome' && (
            <>
              <View style={{ height: 48 }} />
              <Label style={styles.badge}>NEWLORA / {t('marketScope')}</Label>
              <Label style={[styles.title, { fontSize: 38, lineHeight: 54 }]}>
                {t('greeting')}
              </Label>
              <Label
                style={[
                  styles.muted,
                  { fontSize: 17, lineHeight: 28, marginBottom: 18 },
                ]}
              >
                {t('subtitle')}
              </Label>
              {composer}
              <View style={{ gap: 10, marginTop: 12 }}>
                {['gold', 'sessions', 'monitor'].map(key => (
                  <Button
                    key={key}
                    label={t(key)}
                    onPress={() => {
                      void safe(() => send(t(key + 'Prompt')));
                    }}
                  />
                ))}
              </View>
            </>
          )}
          {screen === 'chats' && !session && (
            <>
              <Label style={styles.title}>{t('chats')}</Label>
              <Row>
                <Input
                  accessibilityLabel={t('search')}
                  placeholder={t('search')}
                  value={search}
                  onChangeText={setSearch}
                  style={{ flex: 1 }}
                />
                <Button
                  compact
                  label={t('search')}
                  onPress={() => {
                    void safe(load);
                  }}
                />
              </Row>
              <Button
                primary
                label={t('newChat')}
                onPress={() => navigate('welcome')}
              />
              {conversations.length === 0 && (
                <Label style={styles.muted}>{t('emptyChats')}</Label>
              )}
              {conversations.map(c => (
                <Card key={c.id}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      void safe(() => openConversation(c.id));
                    }}
                  >
                    <Label>{String(c.data.title || t('newChat'))}</Label>
                    <Label style={styles.muted}>
                      {new Date(c.updatedAt).toLocaleDateString(language)}
                    </Label>
                  </Pressable>
                  <Row>
                    <Button
                      compact
                      label={t('rename')}
                      onPress={() =>
                        setRename({
                          id: c.id,
                          title: String(c.data.title || ''),
                        })
                      }
                    />
                    <Button
                      compact
                      label={t('delete')}
                      onPress={() =>
                        Alert.alert(t('delete'), t('confirmDelete'), [
                          { text: t('cancel'), style: 'cancel' },
                          {
                            text: t('confirm'),
                            style: 'destructive',
                            onPress: () => {
                              void safe(async () => {
                                await request(
                                  '/conversations/' + c.id,
                                  'DELETE',
                                );
                                await load();
                              });
                            },
                          },
                        ])
                      }
                    />
                  </Row>
                </Card>
              ))}
            </>
          )}
          {screen === 'chats' && session && (
            <>
              {messages.map(m => (
                <View
                  key={m.clientId}
                  style={
                    m.role === 'user'
                      ? {
                          backgroundColor: colors.raised,
                          borderRadius: 20,
                          padding: 16,
                          marginStart: 32,
                        }
                      : { paddingVertical: 8 }
                  }
                >
                  {m.role === 'assistant' && (
                    <Label style={[styles.badge, { marginBottom: 8 }]}>
                      {t('brand')}
                    </Label>
                  )}
                  <Label selectable>{m.text}</Label>
                </View>
              ))}
              {stream !== '' && <Label>{stream}</Label>}
              {activity.length > 0 && run && (
                <Card style={{ padding: 14 }}>
                  {activity.map((a, i) => (
                    <Label key={i} style={styles.muted}>
                      {a}
                    </Label>
                  ))}
                </Card>
              )}
              {chatRecs.map(r => (
                <RecommendationCard
                  key={r.id}
                  item={r}
                  onOpen={() => setDetail(r)}
                />
              ))}
              {artifacts.map(a => (
                <ArtifactView
                  key={a.id}
                  item={a}
                  onChart={setChart}
                  onInteraction={() => {
                    void loadHistory(session);
                  }}
                />
              ))}
              {composer}
            </>
          )}
          {screen === 'recommendations' && (
            <>
              <Label style={styles.title}>{t('recommendations')}</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row>
                  {[
                    'all',
                    'active',
                    'updated',
                    'completed',
                    'invalidated',
                    'cancelled',
                  ].map(f => (
                    <Button
                      compact
                      key={f}
                      label={t(f)}
                      primary={filter === f}
                      onPress={() => setFilter(f)}
                    />
                  ))}
                </Row>
              </ScrollView>
              {recs.length === 0 && (
                <Label style={styles.muted}>{t('emptyRecommendations')}</Label>
              )}
              {recs
                .filter(r => filter === 'all' || r.data.status === filter)
                .map(r => (
                  <RecommendationCard
                    key={r.id}
                    item={r}
                    onOpen={() => {
                      void safe(() => openConversation(r.sessionId!));
                    }}
                  />
                ))}
            </>
          )}
          {screen === 'tasks' && (
            <>
              <Label style={styles.title}>{t('tasks')}</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row>
                  {['all', 'active', 'paused', 'completed'].map(f => (
                    <Button
                      compact
                      key={f}
                      label={t(f)}
                      primary={filter === f}
                      onPress={() => setFilter(f)}
                    />
                  ))}
                </Row>
              </ScrollView>
              {tasks.length === 0 && (
                <Label style={styles.muted}>{t('emptyTasks')}</Label>
              )}
              {tasks
                .filter(task => filter === 'all' || task.status === filter)
                .map(task => (
                  <Card key={task.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Label style={styles.badge}>{t(task.status)}</Label>
                      {task.config.instrument && (
                        <Label>{isolate(task.config.instrument)}</Label>
                      )}
                    </Row>
                    <Label>{task.config.objective}</Label>
                    {task.latestResult && (
                      <Label style={styles.muted}>{task.latestResult}</Label>
                    )}
                    {task.latestCheck && (
                      <Label style={styles.muted}>
                        {t('lastCheck')} ·{' '}
                        {new Date(task.latestCheck).toLocaleString(language)}
                      </Label>
                    )}
                    {task.nextCheck && (
                      <Label style={styles.muted}>
                        {t('nextCheck')} ·{' '}
                        {new Date(task.nextCheck).toLocaleString(language)}
                      </Label>
                    )}
                    <Row style={{ flexWrap: 'wrap' }}>
                      {['active', 'paused'].includes(task.status) && (
                        <Button
                          compact
                          label={t(
                            task.status === 'active' ? 'pause' : 'resume',
                          )}
                          onPress={() => {
                            void safe(async () => {
                              await request(
                                '/tasks/' +
                                  task.id +
                                  '/' +
                                  (task.status === 'active'
                                    ? 'pause'
                                    : 'resume'),
                                'POST',
                              );
                              await load();
                            });
                          }}
                        />
                      )}
                      {['active', 'paused'].includes(task.status) && (
                        <Button
                          compact
                          label={t('cancel')}
                          onPress={() => {
                            void safe(async () => {
                              await request(
                                '/tasks/' + task.id + '/cancel',
                                'POST',
                              );
                              await load();
                            });
                          }}
                        />
                      )}
                      <Button
                        compact
                        label={t('openChat')}
                        onPress={() => {
                          void safe(() => openConversation(task.sessionId));
                        }}
                      />
                    </Row>
                  </Card>
                ))}
            </>
          )}
          {screen === 'usage' && (
            <>
              <Label style={styles.title}>{t('usage')}</Label>
              <ScrollView horizontal>
                <Row>
                  {['today', 'week', 'month', 'custom'].map(r => (
                    <Button
                      key={r}
                      compact
                      label={t(r)}
                      primary={range === r}
                      onPress={() => setRange(r)}
                    />
                  ))}
                </Row>
              </ScrollView>
              {range === 'custom' && (
                <Card>
                  <Input
                    placeholder={t('from')}
                    value={from}
                    onChangeText={setFrom}
                  />
                  <Input
                    placeholder={t('to')}
                    value={to}
                    onChangeText={setTo}
                  />
                  <Button
                    label={t('select')}
                    onPress={() => {
                      void safe(load);
                    }}
                  />
                </Card>
              )}
              {usage && (
                <>
                  <Card>
                    <Label style={styles.muted}>{t('tokens')}</Label>
                    <Label style={[styles.title, { fontSize: 40 }]}>
                      {usage.tokens.toLocaleString(language)}
                    </Label>
                    <Label style={styles.muted}>
                      {usage.cost === null
                        ? t('unknownCost')
                        : '$' + usage.cost.toFixed(4)}
                    </Label>
                    <Label>
                      {usage.calls.toLocaleString(language)} {t('calls')}
                    </Label>
                  </Card>
                  {usage.calls === 0 ? (
                    <Label style={styles.muted}>{t('emptyUsage')}</Label>
                  ) : (
                    [
                      'day',
                      'provider',
                      'model',
                      'agent_type',
                      'session_id',
                      'task_id',
                    ].map(group => (
                      <Card key={group}>
                        <Label>
                          {t(
                            (
                              {
                                day: 'days',
                                provider: 'providers',
                                model: 'models',
                                agent_type: 'subagent',
                                session_id: 'chats',
                                task_id: 'tasks',
                              } as Record<string, string>
                            )[group],
                          )}
                        </Label>
                        {Object.entries(usage.breakdowns[group] || {})
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 10)
                          .map(([key, value]) => (
                            <View key={key} style={{ gap: 6 }}>
                              <Row style={{ justifyContent: 'space-between' }}>
                                <Label
                                  numberOfLines={1}
                                  style={[styles.muted, { flex: 1 }]}
                                >
                                  {isolate(key)}
                                </Label>
                                <Label>{value.toLocaleString(language)}</Label>
                              </Row>
                              <View
                                style={{
                                  height: 5,
                                  backgroundColor: colors.raised,
                                  borderRadius: 3,
                                }}
                              >
                                <View
                                  style={{
                                    width: `${
                                      usage.tokens
                                        ? (value / usage.tokens) * 100
                                        : 0
                                    }%`,
                                    height: 5,
                                    backgroundColor: colors.accent,
                                    borderRadius: 3,
                                    alignSelf: rtl ? 'flex-end' : 'flex-start',
                                  }}
                                />
                              </View>
                            </View>
                          ))}
                      </Card>
                    ))
                  )}
                </>
              )}
            </>
          )}
          {screen === 'settings' && (
            <SettingsView
              onLanguage={setLanguage}
              onLogout={() => {
                setSigned(false);
                setSession(null);
              }}
            />
          )}
          {busy && <ActivityIndicator color={colors.accent} />}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={drawer}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawer(false)}
      >
        <View
          style={{
            flex: 1,
            flexDirection: rtl ? 'row-reverse' : 'row',
            backgroundColor: '#0009',
          }}
        >
          <SafeAreaView
            style={{
              width: '84%',
              backgroundColor: colors.surface,
              padding: 24,
              gap: 24,
            }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Label style={{ fontSize: 24 }}>{t('brand')}</Label>
              <Button
                compact
                label={t('close')}
                onPress={() => setDrawer(false)}
              />
            </Row>
            <Label style={styles.muted}>{t('subtitle')}</Label>
            <View style={{ gap: 10, marginTop: 18 }}>
              {sections.map(s => (
                <Button
                  key={s}
                  label={t(s)}
                  primary={screen === s}
                  onPress={() => navigate(s)}
                />
              ))}
            </View>
          </SafeAreaView>
          <Pressable
            accessibilityLabel={t('close')}
            style={{ flex: 1 }}
            onPress={() => setDrawer(false)}
          />
        </View>
      </Modal>
      <Modal
        visible={Boolean(detail)}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <Row style={{ padding: 16 }}>
            <Button label={t('close')} onPress={() => setDetail(null)} />
          </Row>
          {detail && (
            <RecommendationDetail
              item={detail}
              onChat={s => {
                setDetail(null);
                void safe(() => openConversation(s));
              }}
              onTask={() => {
                setDetail(null);
                setScreen('tasks');
              }}
              onChart={a => {
                setDetail(null);
                setChart(a);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={Boolean(chart)}
        animationType="slide"
        onRequestClose={() => setChart(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <Row style={{ padding: 16 }}>
            <Button label={t('close')} onPress={() => setChart(null)} />
            <Label>{chart?.data.title}</Label>
          </Row>
          {chart && <ChartView item={chart} />}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={Boolean(call)}
        animationType="slide"
        onRequestClose={() => setCall(null)}
      >
        {call && (
          <CallView
            incoming={call === 'incoming'}
            sessionId={call === 'incoming' ? callSession : session || undefined}
            onClose={() => setCall(null)}
          />
        )}
      </Modal>
      <Modal
        visible={Boolean(rename)}
        transparent
        animationType="fade"
        onRequestClose={() => setRename(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 24,
            backgroundColor: '#000a',
          }}
        >
          <Card>
            <Input
              value={rename?.title || ''}
              onChangeText={title =>
                setRename(rename ? { ...rename, title } : null)
              }
            />
            <Button
              primary
              label={t('save')}
              onPress={() => {
                void safe(async () => {
                  if (rename)
                    await request('/conversations/' + rename.id, 'PATCH', {
                      title: rename.title,
                    });
                  setRename(null);
                  await load();
                });
              }}
            />
            <Button label={t('cancel')} onPress={() => setRename(null)} />
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
export default function App() {
  const [language, setLanguage] = useState<Language>('ar');
  return (
    <SafeAreaProvider>
      <LocaleContext.Provider value={language}>
        <Application language={language} setLanguage={setLanguage} />
      </LocaleContext.Provider>
    </SafeAreaProvider>
  );
}
