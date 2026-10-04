import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { VoiceSession } from '../services/voice';
import { useLocale } from '../i18n';
import { Button, Label, Row, colors, styles } from './UI';
export function CallView({
  incoming,
  sessionId,
  onClose,
}: {
  incoming: boolean;
  sessionId?: string;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const session = useRef(new VoiceSession());
  const [status, setStatus] = useState(incoming ? 'incoming' : 'calling');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [error, setError] = useState('');
  const start = () => {
    session.current.stop();
    setError('');
    void session.current.start(setStatus, sessionId).catch(e => {
      setError(e.code || 'error');
      setStatus('reconnect');
      session.current.stop();
    });
  };
  useEffect(() => {
    if (!incoming) start();
    const s = session.current;
    return () => s.stop();
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
          width: 100,
          height: 100,
          borderRadius: 50,
          borderWidth: 1,
          borderColor: colors.accent,
          alignSelf: 'center',
          justifyContent: 'center',
        }}
      >
        <Label
          style={{ textAlign: 'center', fontSize: 36, color: colors.accent }}
        >
          N
        </Label>
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
