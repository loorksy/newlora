import type { OtaState } from './types';

export const OTA_VERIFICATION = 'NANOBOT-UI-OTA-2';

export function runningBundle(state: OtaState): { source: 'embedded' | 'ota'; updateId: string } {
  if (state.launchSource === 'embedded' || !state.launchedId) {
    return { source: 'embedded', updateId: '' };
  }
  return { source: 'ota', updateId: state.launchedId };
}

export function embeddedBuildId(
  source: 'embedded' | 'ota',
  nativeSha: string,
  bundleSha: string,
): string {
  if (nativeSha) return nativeSha;
  if (source === 'embedded') return bundleSha;
  return '';
}
