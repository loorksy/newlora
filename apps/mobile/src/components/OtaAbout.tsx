import React from 'react';
import { useLocale, isolate } from '../i18n';
import { GIT_SHA } from '../ota/buildStamp';
import { OTA_VERIFICATION, embeddedBuildId, runningBundle } from '../ota/diagnostics';
import { readNativeBuild } from '../ota/native';
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

function valueOrNone(value: string, none: string) {
  return value ? isolate(value) : none;
}

export function OtaAbout() {
  const { t } = useLocale();
  const session = useOtaSession();
  const native = readNativeBuild();
  const running = runningBundle(session.state);
  const embedded = embeddedBuildId(running.source, native.embeddedGitSha, GIT_SHA);
  const none = t('otaNone');
  const checked = session.state.lastCheckedAt || '';
  return (
    <>
      <Label style={styles.muted}>
        {t('otaNative')} · {isolate(native.versionName)}
      </Label>
      <Label style={styles.muted}>
        {t('otaVersionCode')} · {isolate(String(native.versionCode))}
      </Label>
      <Label style={styles.muted}>
        {t('otaChannel')} · {isolate(session.state.channel || OTA_CHANNEL)}
      </Label>
      <Label style={styles.muted}>
        {t('otaRuntime')} · {isolate(RUNTIME_VERSION)}
      </Label>
      <Label style={styles.muted} testID="embedded-build-id">
        {t('otaEmbeddedBuild')} · {valueOrNone(embedded, none)}
      </Label>
      <Label style={styles.muted} testID="bundle-source">
        {t('otaBundleSource')} · {t(running.source === 'ota' ? 'otaSourceOta' : 'otaSourceEmbedded')}
      </Label>
      <Label style={styles.muted} testID="running-update-id">
        {t('otaRunningUpdate')} · {valueOrNone(running.updateId, none)}
      </Label>
      <Label style={styles.muted} testID="known-good-update">
        {t('otaKnownGood')} · {valueOrNone(session.state.good?.id || '', none)}
      </Label>
      <Label style={styles.muted} testID="pending-update">
        {t('otaPending')} · {valueOrNone(session.state.pending?.id || '', none)}
      </Label>
      <Label style={styles.muted}>
        {t('otaStatus')} · {t(phaseKey[session.phase])}
      </Label>
      <Label style={styles.muted}>
        {t('otaChecked')} · {valueOrNone(checked, none)}
      </Label>
      <Label style={styles.muted} testID="last-ota-error">
        {t('otaLastError')} · {valueOrNone(session.state.lastError || '', none)}
      </Label>
      <Label style={styles.muted}>
        {t('otaGit')} · {valueOrNone(GIT_SHA, none)}
      </Label>
      <Label style={styles.muted} testID="ota-verification">
        {t('otaVerification')} · {isolate(OTA_VERIFICATION)}
      </Label>
      <Button label={t('otaCheck')} onPress={() => void session.check()} />
      {session.phase === 'ready' && (
        <Button primary label={t('otaNow')} onPress={() => void session.apply()} />
      )}
      <Button label={t('otaReset')} onPress={() => void session.reset()} />
    </>
  );
}
