import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Linking } from 'react-native';
import type { Artifact, EventEnvelope, Preferences, Resource, Task } from '@newlora/contracts';
import { isolate, useLocale, type Language } from '../i18n';
import { APIError, id, login, request, restore, subscribe } from '../services/api';
import { pickAttachment, pickImage, uploadAttachment, type SelectedFile } from '../services/attachments';
import { foregroundNotifications, initialNotification } from '../services/notifications';
import type {
  ActivityItem,
  ArtifactResource,
  ChartContext,
  ChatMessage,
  HistoryPayload,
  RecommendationResource,
  ScreenId,
  UsageSummary,
} from './types';

export function useAppController(
  language: Language,
  setLanguage: (language: Language) => void,
) {
  const { t } = useLocale();
  const [signed, setSigned] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [server, setServer] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState<ScreenId>('home');
  const [drawer, setDrawer] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [runState, setRunState] = useState('');
  const [leaveNotice, setLeaveNotice] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [session, setSession] = useState<string | null>(null);
  const [run, setRun] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactResource[]>([]);
  const [chatRecs, setChatRecs] = useState<RecommendationResource[]>([]);
  const [conversations, setConversations] = useState<Resource[]>([]);
  const [recs, setRecs] = useState<RecommendationResource[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [taskFocus, setTaskFocus] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [chart, setChart] = useState<ArtifactResource | null>(null);
  const [chartContext, setChartContext] = useState<ChartContext | null>(null);
  const [notificationId, setNotificationId] = useState<string | undefined>();
  const [callSession, setCallSession] = useState<string | undefined>();
  const [call, setCall] = useState<'outgoing' | 'incoming' | null>(null);
  const [detail, setDetail] = useState<RecommendationResource | null>(null);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(null);
  const [stream, setStream] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);

  const safe = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      setOnline(true);
    } catch (e) {
      const code = (e as APIError).code || 'error';
      if (code === 'networkError') setOnline(false);
      setError(t(code));
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = useCallback(async (current: string) => {
    const history = await request<HistoryPayload>('/conversations/' + current);
    setMessages(history.messages);
    setRun(history.activeRunId || null);
    if (history.activeRunId)
      setRunState(history.activeRunStatus === 'queued' ? 'queued' : 'analyzing');
    setArtifacts(
      history.resources.filter(item => item.type === 'artifact') as ArtifactResource[],
    );
    setChatRecs(
      history.resources.filter(
        item => item.type === 'recommendation',
      ) as RecommendationResource[],
    );
    const charts = history.resources.filter(
      item => item.type === 'artifact' && (item.data as Artifact).type === 'chart',
    );
    if (charts.length) {
      const latest = charts[charts.length - 1] as ArtifactResource;
      const data = latest.data.data;
      const instrument = typeof data.instrument === 'string' ? data.instrument : '';
      const timeframe = typeof data.timeframe === 'string' ? data.timeframe : '';
      if (instrument || timeframe)
        setChartContext({ instrument, timeframe, artifactId: latest.id });
    }
  }, []);

  const openConversation = async (current: string) => {
    setSession(current);
    setScreen('chats');
    setRun(null);
    setActivity([]);
    setRunState('');
    setFiles([]);
    setChartContext(null);
    setStream('');
    await loadHistory(current);
  };

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    return () => subscription.remove();
  }, []);

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
  }, [setLanguage]);

  useEffect(() => {
    if (!signed) return;
    const receiveCall = (url: string) => {
      setNotificationId(decodeURIComponent(url.split('/').pop()!.split('?')[0]));
      const match = url.match(/[?&]session=([^&]*)/);
      setCallSession(match?.[1] ? decodeURIComponent(match[1]) : undefined);
      setCall('incoming');
    };
    const handleLink = (url: string) => {
      const resourceId = decodeURIComponent(url.split('/').pop()!.split('?')[0]);
      if (url.startsWith('newlora://call/')) receiveCall(url);
      else if (url.startsWith('newlora://chat/'))
        void safe(() => openConversation(resourceId));
      else if (url.startsWith('newlora://recommendation/'))
        void safe(async () => {
          setDetail(
            await request<RecommendationResource>('/resource/' + resourceId),
          );
          setScreen('recommendations');
        });
      else if (url.startsWith('newlora://task/'))
        void safe(async () => {
          const items = await request<Task[]>('/tasks');
          setTasks(items);
          setTaskFocus(resourceId);
          setFilter('all');
          setScreen('tasks');
        });
    };
    const listener = Linking.addEventListener('url', ({ url }) => handleLink(url));
    void Linking.getInitialURL().then(url => {
      if (url) handleLink(url);
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
      (event: EventEnvelope) => {
        if (event.event === 'agent.activity') {
          const payload = event.payload;
          const key = String(
            payload.type === 'tool_failed' ? 'tool_failed' : payload.tool || payload.type,
          );
          if (payload.type === 'subagent_spawned') setRunState('waitingSubagents');
          else if (payload.type === 'agent_started' || payload.type === 'subagent_completed')
            setRunState('analyzing');
          const label =
            t(key) +
            (payload.instrument ? ' · ' + isolate(String(payload.instrument)) : '');
          setActivity(previous => [...previous.slice(-4), { key, label }]);
        } else if (event.event === 'chat.stream.started') {
          setStream('');
        } else if (event.event === 'chat.delta') {
          setStream(previous => previous + String(event.payload.text || ''));
        } else if (event.event === 'chat.message') {
          setStream('');
          void loadHistory(session);
        } else if (event.event === 'resource.updated') {
          void loadHistory(session);
        } else if (event.event === 'chart.context') {
          const payload = event.payload;
          const instrument =
            typeof payload.instrument === 'string' ? payload.instrument : '';
          const timeframe =
            typeof payload.timeframe === 'string' ? payload.timeframe : '';
          if (instrument || timeframe)
            setChartContext({
              instrument,
              timeframe,
              artifactId: String(payload.artifactId || ''),
            });
        } else if (event.event.startsWith('run.')) {
          setRunState(event.event.slice(4));
          setRun(null);
          setStream('');
          if (event.event === 'run.failed')
            setError(t(String(event.payload.code || 'error')));
          void loadHistory(session);
        }
      },
      () => {
        setOnline(false);
        setError(t('networkError'));
      },
    );
  }, [session, signed, language, loadHistory]);

  const load = async () => {
    if (screen === 'home')
      setConversations(await request<Resource[]>('/conversations?q='));
    if (screen === 'chats' && !session)
      setConversations(
        await request<Resource[]>('/conversations?q=' + encodeURIComponent(search)),
      );
    if (screen === 'recommendations')
      setRecs(await request<RecommendationResource[]>('/resources/recommendation'));
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
      const data = await request<UsageSummary>(
        '/usage?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end),
      );
      setUsage(data && typeof data.tokens === 'number' ? data : null);
    }
  };

  useEffect(() => {
    if (!signed || screen === 'settings' || (screen === 'chats' && session)) return;
    if (range === 'custom' && screen === 'usage') return;
    let cancelled = false;
    void load()
      .then(() => {
        if (!cancelled) setOnline(true);
      })
      .catch(e => {
        if (cancelled) return;
        const code = (e as APIError).code || 'error';
        if (code === 'networkError') setOnline(false);
        setError(t(code));
      });
    return () => {
      cancelled = true;
    };
  }, [screen, session, signed, range]);

  const send = async (value = text) => {
    if (!value.trim() && !files.length) return;
    let current = session;
    if (!current) {
      const row = await request<Resource>('/conversations', 'POST', { title: '' });
      current = row.id;
      setSession(current);
    }
    setScreen('chats');
    const attachmentIds: string[] = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const attachmentId =
        file.id ||
        (await uploadAttachment(current, file, percent =>
          setFiles(previous =>
            previous.map((item, itemIndex) =>
              itemIndex === index ? { ...item, progress: percent } : item,
            ),
          ),
        ));
      file.id = attachmentId;
      attachmentIds.push(attachmentId);
    }
    const clientId = id();
    const result = await request<{ runId: string }>(
      '/conversations/' + current + '/messages',
      'POST',
      { clientId, text: value, attachmentIds },
    );
    setRun(result.runId);
    setRunState('queued');
    setLeaveNotice(true);
    setFiles([]);
    setText('');
    setActivity([]);
    setMessages(previous => [
      ...previous,
      { clientId, role: 'user', text: value, attachmentIds },
    ]);
  };

  const navigate = (next: ScreenId) => {
    setScreen(next);
    setDrawer(false);
    setFilter('all');
    setTaskFocus(null);
    setSearch('');
    if (next === 'home' || next === 'chats') {
      setSession(null);
      setMessages([]);
      setChartContext(null);
      setArtifacts([]);
      setChatRecs([]);
      setRun(null);
      setRunState('');
      setStream('');
      setActivity([]);
      setFiles([]);
      setLeaveNotice(false);
    }
  };

  const addFile = (file: SelectedFile | null) => {
    if (file) setFiles(previous => [...previous, file].slice(0, 4));
  };

  return {
    signed,
    restoring,
    server,
    setServer,
    password,
    setPassword,
    screen,
    drawer,
    setDrawer,
    files,
    setFiles,
    runState,
    leaveNotice,
    text,
    setText,
    error,
    busy,
    online,
    session,
    run,
    messages,
    artifacts,
    chatRecs,
    conversations,
    recs,
    tasks,
    usage,
    range,
    setRange,
    from,
    setFrom,
    to,
    setTo,
    taskFocus,
    filter,
    setFilter,
    search,
    setSearch,
    activity,
    chart,
    setChart,
    chartContext,
    notificationId,
    callSession,
    call,
    setCall,
    detail,
    setDetail,
    rename,
    setRename,
    stream,
    reduceMotion,
    safe,
    load,
    loadHistory,
    openConversation,
    send,
    navigate,
    signIn: () =>
      safe(async () => {
        await login(server.trim().replace(/\/$/, ''), password);
        setPassword('');
        setSigned(true);
      }),
    signOut: () => {
      setSigned(false);
      setSession(null);
    },
    pickFile: () => {
      void safe(async () => addFile(await pickAttachment()));
    },
    pickImageFile: () => {
      void safe(async () => addFile(await pickImage()));
    },
    removeFile: (index: number) => {
      const file = files[index];
      if (file?.id) void request('/attachments/' + file.id, 'DELETE').catch(() => {});
      setFiles(previous => previous.filter((_, itemIndex) => itemIndex !== index));
    },
    stop: () => {
      void safe(async () => {
        await request('/runs/' + run + '/stop', 'POST');
        setRun(null);
      });
    },
    openChart: () => {
      void safe(async () => {
        if (!chartContext) return;
        setChart(await request<ArtifactResource>('/resource/' + chartContext.artifactId));
      });
    },
    retry: () => {
      void safe(session ? () => loadHistory(session) : load);
    },
    startCall: () => {
      setNotificationId(undefined);
      setCall('outgoing');
    },
  };
}
