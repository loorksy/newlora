export const RUNTIME_VERSION = 'newlora-android-runtime-1';
export const OTA_CHANNEL = 'preview' as const;
export const OTA_HOST = 'newlora.lork.cloud';
export const OTA_ORIGIN = 'https://newlora.lork.cloud';
export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;
export const CHECK_INTERVAL_MS = 20 * 60 * 1000;
export const DOWNLOAD_TIMEOUT_MS = 45_000;
export const MAX_PENDING_ATTEMPTS = 2;

export type OtaChannel = 'preview' | 'stable';

export type OtaPhase =
  | 'upToDate'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'applying'
  | 'apkRequired'
  | 'failed';

export type ReleaseAsset = {
  path: string;
  url: string;
  sha256: string;
  size: number;
};

export type ReleaseManifest = {
  id: string;
  channel: string;
  platform: 'android';
  version: string;
  runtimeVersion: string;
  createdAt: string;
  gitSha: string;
  bundle: {
    url: string;
    sha256: string;
    size: number;
    contentType: string;
  };
  assets: ReleaseAsset[];
  notes: string;
  signature: string;
};

export type InstalledRelease = {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  gitSha: string;
  version: string;
  sha256: string;
  notes: string;
};

export type LaunchSource = 'embedded' | 'good' | 'pending';

export type OtaState = {
  channel: string;
  runtimeVersion: string;
  good: InstalledRelease | null;
  previous: InstalledRelease | null;
  pending: InstalledRelease | null;
  pendingAttempts: number;
  launchedId: string | null;
  launchSource: LaunchSource;
  healthy: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  status: OtaPhase;
};

export type ActivityFlags = {
  typing: boolean;
  uploading: boolean;
  streaming: boolean;
  voice: boolean;
  submitting: boolean;
};

export function emptyState(channel: string = OTA_CHANNEL): OtaState {
  return {
    channel,
    runtimeVersion: RUNTIME_VERSION,
    good: null,
    previous: null,
    pending: null,
    pendingAttempts: 0,
    launchedId: null,
    launchSource: 'embedded',
    healthy: false,
    lastCheckedAt: null,
    lastError: null,
    status: 'upToDate',
  };
}

export function manifestUrl(channel: string): string {
  return `${OTA_ORIGIN}/app-updates/android/${channel}/manifest`;
}
