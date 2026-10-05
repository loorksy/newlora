import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { request } from '../services/api';
import { VoiceSession } from '../services/voice';
import { useLocale } from '../i18n';
import { useColors } from '../theme';
import { Icon } from './Icon';
import { Button, Label, Row, styles } from './UI';
export function CallView({
  incoming,
  notificationId,
  sessionId,
  onClose,
}: {
  incoming: boolean;
  notificationId?: string;
  sessionId?: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const colors = useColors();
  const session = useRef(new VoiceSession());
  const mounted = useRef(true);
  const [status, setStatus] = useState(incoming ? 'incoming' : 'calling');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [error, setError] = useState('');
  const start = () => {
    session.current.stop();
    const connection = new VoiceSession();
    session.current = connection;
    setError('');
    setMuted(false);
    setSpeaker(false);
    const connect = async () => {
      if (notificationId) {
        const state = await request<{ available: boolean }>(
          '/notifications/' + notificationId,
        );
        if (!mounted.current || session.current !== connection) return;
        if (!state.available) {
          setStatus('ended');
          return;
        }
      }
      if (!mounted.current || session.current !== connection) return;
      await connection.start(state => {
        if (mounted.current && session.current === connection) setStatus(state);
      }, sessionId);
    };
    void connect().catch(e => {
      if (!mounted.current || session.current !== connection) return;
      setError(e.code || 'error');
      setStatus('reconnect');
      session.current.stop();
    });
  };
  useEffect(() => {
    mounted.current = true;
    if (!incoming) start();
    return () => {
      mounted.current = false;
      session.current.stop();
    };
  }, []);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 28,
        gap: 28,
        backgroundColor: colors.bg,
      }}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignSelf: 'center',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="voice" size={36} color={colors.text} />
      </View>
      <Label style={[styles.title, { textAlign: 'center' }]}>{t(status)}</Label>
      <Label style={[styles.muted, { textAlign: 'center' }]}>
        {t('inCall')}
      </Label>
      {error !== '' && <Label>{t(error)}</Label>}
      {status === 'incoming' ? (
        <Row>
          <Button primary label={t('accept')} onPress={start} />
          <Button label={t('decline')} onPress={onClose} />
        </Row>
      ) : (
        <>
          <Row style={{ justifyContent: 'center' }}>
            <Button
              label={t(muted ? 'unmute' : 'mute')}
              onPress={() => {
                session.current.mute(!muted);
                setMuted(!muted);
              }}
            />
            <Button
              label={t('speaker')}
              primary={speaker}
              onPress={() => {
                session.current.speaker(!speaker);
                setSpeaker(!speaker);
              }}
            />
          </Row>
          {status === 'reconnect' && (
            <Button label={t('reconnect')} onPress={start} />
          )}
          <Button
            label={t('endCall')}
            onPress={() => {
              session.current.stop();
              onClose();
            }}
          />
        </>
      )}
    </View>
  );
}
