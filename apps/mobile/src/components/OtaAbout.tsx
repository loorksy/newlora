import React from 'react';
import { useLocale, isolate } from '../i18n';
import { GIT_SHA, NATIVE_VERSION, RELEASE_LABEL } from '../ota/buildStamp';
import { useOtaSession } from '../ota/session';
import { OTA_CHANNEL, RUNTIME_VERSION } from '../ota/types';
import { Button, Label, styles } from './UI';

const phaseKey = {
  upToDate: 'otaUpToDate',
  checking: 'otaChecking',
  downloading: 'otaDownloading',
  ready: 'otaReady',
  applying: 'otaApplying',
  apkRequired: 'otaApkRequired',
  failed: 'otaFailed',
} as const;

export function OtaAbout() {
  const { t } = useLocale();
  const session = useOtaSession();
  const release = session.state.good;
  const updateId = release?.id || session.state.pending?.id || '';
  const revision = release?.gitSha || GIT_SHA || RELEASE_LABEL;
  const checked = session.state.lastCheckedAt || '';
  return (
    <>
      <Label style={styles.muted}>
        {t('otaNative')} · {isolate(NATIVE_VERSION)}
      </Label>
      <Label style={styles.muted}>
        {t('otaRuntime')} · {isolate(RUNTIME_VERSION)}
      </Label>
      <Label style={styles.muted}>
        {t('otaChannel')} · {isolate(session.state.channel || OTA_CHANNEL)}
      </Label>
      <Label style={styles.muted}>
        {t('otaUpdate')} · {updateId ? isolate(updateId) : t('otaEmbedded')}
      </Label>
      <Label style={styles.muted}>
        {t('otaGit')} · {isolate(revision)}
      </Label>
      <Label style={styles.muted}>
        {t('otaStatus')} · {t(phaseKey[session.phase])}
      </Label>
      {checked !== '' && (
        <Label style={styles.muted}>
          {t('otaChecked')} · {isolate(checked)}
        </Label>
      )}
      <Button label={t('otaCheck')} onPress={() => void session.check()} />
      {session.phase === 'ready' && (
        <Button primary label={t('otaNow')} onPress={() => void session.apply()} />
      )}
      <Button label={t('otaReset')} onPress={() => void session.reset()} />
    </>
  );
}
