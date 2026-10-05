import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { UpdateSheet } from '../components/UpdateSheet';
import { checkUpdate, markHealthy, reloadAllowed, resetToEmbedded, shouldCheck } from './engine';
import { bridgeFs, otaNative } from './native';
import { OTA_PUBLIC_KEY_HEX } from './publicKey';
import { publishOta, useOtaSession } from './session';
import { sensitiveNow, subscribeSensitive } from './sensitivity';
import {
  CHECK_INTERVAL_MS,
  OTA_CHANNEL,
  RUNTIME_VERSION,
  manifestUrl,
  type ActivityFlags,
  type OtaPhase,
  type OtaState,
} from './types';
import { hexToBytes } from './verify';

export function OtaCoordinator({
  typing,
  uploading,
  streaming,
  voice,
  submitting,
  reduceMotion,
}: ActivityFlags & { reduceMotion: boolean }) {
  const session = useOtaSession();
  const [open, setOpen] = useState(false);
  const [sens, setSens] = useState(sensitiveNow());
  const blocked =
    !reloadAllowed({ typing, uploading, streaming, voice, submitting }) || sens;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => subscribeSensitive(() => setSens(sensitiveNow())), []);

  useEffect(() => {
    const native = otaNative();
    if (!native) return;
    const fs = bridgeFs(native);
    const key = hexToBytes(OTA_PUBLIC_KEY_HEX);
    let stopped = false;
    const publish = (phase: OtaPhase, state: OtaState) => {
      publishOta({
        phase,
        state,
        ready: true,
        check: () => run(true),
        apply: () => apply(),
        reset: () => reset(),
      });
    };
    const run = async (manual: boolean) => {
      const current = await fs.readState();
      if (!manual && (current.status === 'checking' || current.status === 'downloading')) return;
      const result = await checkUpdate({
        fs,
        publicKey: key,
        channel: OTA_CHANNEL,
        runtimeVersion: RUNTIME_VERSION,
        manifestUrl: manifestUrl(OTA_CHANNEL),
      });
      if (stopped) return;
      publish(result.phase, result.state);
    };
    const apply = async () => {
      if (blockedRef.current) return;
      const current = await fs.readState();
      publish('applying', { ...current, status: 'applying' });
      await native.reload();
    };
    const reset = async () => {
      const next = resetToEmbedded(await fs.readState());
      await fs.writeState(next);
      await native.reload();
    };
    void (async () => {
      const booted = markHealthy(await fs.readState());
      await fs.writeState(booted);
      if (!stopped) publish(booted.status, booted);
      await run(false);
    })();
    const appState = AppState.addEventListener('change', next => {
      if (next !== 'active') return;
      void (async () => {
        const current = await fs.readState();
        if (shouldCheck('foreground', current.lastCheckedAt, Date.now())) await run(false);
      })();
    });
    const timer = setInterval(() => {
      void (async () => {
        const current = await fs.readState();
        if (shouldCheck('interval', current.lastCheckedAt, Date.now())) await run(false);
      })();
    }, CHECK_INTERVAL_MS);
    return () => {
      stopped = true;
      appState.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setOpen(session.phase === 'ready' && !blocked);
  }, [session.phase, blocked]);

  return (
    <UpdateSheet
      visible={open}
      reduceMotion={reduceMotion}
      onUpdate={() => void session.apply()}
    />
  );
}
