import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { applyDirection, LocaleContext, useLocale, type Language } from './src/i18n';
import { useAppController } from './src/app/useAppController';
import { colors, space } from './src/theme';
import { AppHeader } from './src/components/AppHeader';
import { chartCaption, ChartFrame } from './src/components/ChartCard';
import { ChartView } from './src/components/ChartView';
import { CallView } from './src/components/CallView';
import { Composer } from './src/components/Composer';
import { Drawer } from './src/components/Drawer';
import { RecommendationDetail } from './src/components/RecommendationDetail';
import { Button, Card, Input, Label, styles } from './src/components/UI';
import { ChatContextBar, ChatScreen } from './src/screens/ChatScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecommendationsScreen } from './src/screens/RecommendationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { UsageScreen } from './src/screens/UsageScreen';
import { baseURL, request } from './src/services/api';

function Application({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
}) {
  const { t, rtl } = useLocale();
  const app = useAppController(language, setLanguage);
  const chatting = app.screen === 'chats' && Boolean(app.session);
  const composer = (
    <Composer
      text={app.text}
      onChangeText={app.setText}
      files={app.files}
      busy={app.busy}
      running={Boolean(app.run)}
      onRemove={app.removeFile}
      onPickFile={app.pickFile}
      onPickImage={app.pickImageFile}
      onMic={app.startCall}
      onSend={() => {
        void app.safe(() => app.send());
      }}
      onStop={app.stop}
    />
  );
  if (app.restoring)
    return (
      <SafeAreaView style={shell.loading}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  if (!app.signed)
    return (
      <SafeAreaView style={[shell.root, { direction: rtl ? 'rtl' : 'ltr' }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <SignInScreen
            server={app.server}
            password={app.password}
            error={app.error}
            busy={app.busy}
            onServer={app.setServer}
            onPassword={app.setPassword}
            onSubmit={app.signIn}
            onLanguage={setLanguage}
          />
        </ScrollView>
      </SafeAreaView>
    );
  const body = (
    <>
      {app.screen === 'home' && (
        <HomeScreen
          composer={composer}
          recent={app.conversations}
          onPrefill={app.setText}
          onOpen={id => {
            void app.safe(() => app.openConversation(id));
          }}
        />
      )}
      {app.screen === 'chats' && !app.session && (
        <HistoryScreen
          items={app.conversations}
          search={app.search}
          onSearch={app.setSearch}
          onSubmitSearch={() => {
            void app.safe(app.load);
          }}
          onOpen={id => {
            void app.safe(() => app.openConversation(id));
          }}
          onRename={app.setRename}
          onDelete={id => {
            void app.safe(async () => {
              await request('/conversations/' + id, 'DELETE');
              await app.load();
            });
          }}
          onCreate={() => app.navigate('home')}
        />
      )}
      {chatting && (
        <ChatScreen
          messages={app.messages}
          stream={app.stream}
          activity={app.activity}
          runState={app.runState}
          leaveNotice={Boolean(app.leaveNotice && app.run)}
          artifacts={app.artifacts}
          recommendations={app.chatRecs}
          onOpenRecommendation={app.setDetail}
          onChart={app.setChart}
          onInteraction={() => {
            if (app.session) void app.loadHistory(app.session);
          }}
        />
      )}
      {app.screen === 'recommendations' && (
        <RecommendationsScreen
          items={app.recs}
          filter={app.filter}
          onFilter={value => {
            app.setFilter(value);
          }}
          onOpen={app.setDetail}
        />
      )}
      {app.screen === 'tasks' && (
        <TasksScreen
          items={app.tasks}
          filter={app.filter}
          focus={app.taskFocus}
          onFilter={value => {
            app.setFilter(value);
          }}
          onPause={task => {
            void app.safe(async () => {
              await request(
                '/tasks/' +
                  task.id +
                  '/' +
                  (task.status === 'active' ? 'pause' : 'resume'),
                'POST',
              );
              await app.load();
            });
          }}
          onCancel={task => {
            void app.safe(async () => {
              await request('/tasks/' + task.id + '/cancel', 'POST');
              await app.load();
            });
          }}
          onOpen={id => {
            void app.safe(() => app.openConversation(id));
          }}
        />
      )}
      {app.screen === 'usage' && (
        <UsageScreen
          usage={app.usage}
          range={app.range}
          from={app.from}
          to={app.to}
          onRange={app.setRange}
          onFrom={app.setFrom}
          onTo={app.setTo}
          onApply={() => {
            void app.safe(app.load);
          }}
        />
      )}
      {app.screen === 'settings' && (
        <SettingsScreen onLanguage={setLanguage} onLogout={app.signOut} />
      )}
      {app.busy && <ActivityIndicator color={colors.accent} />}
    </>
  );
  return (
    <SafeAreaView style={[shell.root, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <AppHeader
        onMenu={() => app.setDrawer(true)}
        online={app.online}
        status={t(app.online ? 'connected' : 'offline')}
      />
      {chatting && app.chartContext && (
        <ChatContextBar
          instrument={app.chartContext.instrument}
          timeframe={app.chartContext.timeframe}
          onChart={app.openChart}
        />
      )}
      {app.error !== '' && (
        <View style={shell.error}>
          <Label style={shell.errorText}>{app.error}</Label>
          <Button compact label={t('retry')} onPress={app.retry} />
        </View>
      )}
      <KeyboardAvoidingView
        style={shell.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {chatting ? (
          <>
            <ScrollView
              contentContainerStyle={styles.page}
              keyboardShouldPersistTaps="handled"
            >
              {body}
            </ScrollView>
            <View style={shell.dock}>{composer}</View>
          </>
        ) : (
          <ScrollView
            contentContainerStyle={styles.page}
            keyboardShouldPersistTaps="handled"
          >
            {body}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <Drawer
        visible={app.drawer}
        screen={app.session ? 'chats' : app.screen}
        online={app.online}
        server={baseURL()}
        reduceMotion={app.reduceMotion}
        onClose={() => app.setDrawer(false)}
        onNavigate={app.navigate}
      />
      <Modal
        visible={Boolean(app.detail)}
        animationType={app.reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => app.setDetail(null)}
      >
        <SafeAreaView style={shell.root}>
          <View style={shell.modalBar}>
            <Button label={t('close')} onPress={() => app.setDetail(null)} />
          </View>
          {app.detail && (
            <RecommendationDetail
              item={app.detail}
              onChat={sessionId => {
                app.setDetail(null);
                void app.safe(() => app.openConversation(sessionId));
              }}
              onTask={() => {
                app.setDetail(null);
                app.navigate('tasks');
              }}
              onChart={artifact => {
                app.setDetail(null);
                app.setChart(artifact);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={Boolean(app.chart)}
        animationType={app.reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => app.setChart(null)}
      >
        <SafeAreaView style={shell.root}>
          {app.chart && (
            <ChartFrame
              title={app.chart.data.title}
              caption={chartCaption(app.chart.data.data)}
              onClose={() => app.setChart(null)}
            >
              <ChartView item={app.chart} />
            </ChartFrame>
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={Boolean(app.call)}
        animationType={app.reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => app.setCall(null)}
      >
        {app.call && (
          <CallView
            notificationId={app.notificationId}
            incoming={app.call === 'incoming'}
            sessionId={app.call === 'incoming' ? app.callSession : app.session || undefined}
            onClose={() => app.setCall(null)}
          />
        )}
      </Modal>
      <Modal
        visible={Boolean(app.rename)}
        transparent
        animationType={app.reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => app.setRename(null)}
      >
        <View style={shell.rename}>
          <Card>
            <Input
              accessibilityLabel={t('rename')}
              value={app.rename?.title || ''}
              onChangeText={title =>
                app.setRename(app.rename ? { ...app.rename, title } : null)
              }
            />
            <Button
              primary
              label={t('save')}
              onPress={() => {
                void app.safe(async () => {
                  if (app.rename)
                    await request('/conversations/' + app.rename.id, 'PATCH', {
                      title: app.rename.title,
                    });
                  app.setRename(null);
                  await app.load();
                });
              }}
            />
            <Button label={t('cancel')} onPress={() => app.setRename(null)} />
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  const [language, setLanguageState] = useState<Language>('ar');
  const setLanguage = useCallback((next: Language) => {
    applyDirection(next);
    setLanguageState(next);
  }, []);
  useEffect(() => {
    applyDirection(language);
  }, [language]);
  return (
    <SafeAreaProvider>
      <LocaleContext.Provider value={language}>
        <Application language={language} setLanguage={setLanguage} />
      </LocaleContext.Provider>
    </SafeAreaProvider>
  );
}

const shell = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  dock: { paddingHorizontal: space.xl, paddingBottom: space.md },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
  },
  errorText: { color: colors.danger, flex: 1 },
  modalBar: { padding: space.lg },
  rename: {
    flex: 1,
    justifyContent: 'center',
    padding: space.xxl,
    backgroundColor: '#000000aa',
  },
});
