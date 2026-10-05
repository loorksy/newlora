import { encodeUtf8 } from './codec';
import type { ReleaseManifest } from './types';

const ID_RE = /^[A-Za-z0-9._-]{8,80}$/;
const CHANNEL_RE = /^[a-z][a-z0-9-]{0,31}$/;
const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SHA_RE = /^[a-f0-9]{64}$/;
const SHA_GIT_RE = /^[a-f0-9]{7,64}$|^$/;
const PATH_RE = /^[A-Za-z0-9._-]{1,120}$/;

export function canonicalBytes(manifest: ReleaseManifest): Uint8Array {
  const lines = [
    'newlora-ota-v1',
    `id=${manifest.id}`,
    `channel=${manifest.channel}`,
    'platform=android',
    `version=${manifest.version}`,
    `runtimeVersion=${manifest.runtimeVersion}`,
    `createdAt=${manifest.createdAt}`,
    `gitSha=${manifest.gitSha}`,
    `bundleUrl=${manifest.bundle.url}`,
    `bundleSha256=${manifest.bundle.sha256}`,
    `bundleSize=${manifest.bundle.size}`,
    `contentType=${manifest.bundle.contentType}`,
    `notes=${manifest.notes}`,
  ];
  const assets = [...manifest.assets].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const asset of assets) {
    lines.push(`asset=${asset.path}|${asset.sha256}|${asset.size}|${asset.url}`);
  }
  return encodeUtf8(lines.join('\n'));
}

export function malformedReason(manifest: ReleaseManifest): string | null {
  if (!ID_RE.test(manifest.id)) return 'malformed';
  if (!CHANNEL_RE.test(manifest.channel)) return 'malformed';
  if (manifest.platform !== 'android') return 'malformed';
  if (!manifest.version || manifest.version.length > 40) return 'malformed';
  if (!manifest.runtimeVersion || manifest.runtimeVersion.length > 80) return 'malformed';
  if (!TIME_RE.test(manifest.createdAt)) return 'malformed';
  if (!SHA_GIT_RE.test(manifest.gitSha)) return 'malformed';
  if (!SHA_RE.test(manifest.bundle.sha256)) return 'malformed';
  if (!Number.isInteger(manifest.bundle.size) || manifest.bundle.size < 1) return 'malformed';
  if (manifest.bundle.contentType !== 'application/octet-stream') return 'malformed';
  if (manifest.notes.length > 200 || /[\r\n]/.test(manifest.notes)) return 'malformed';
  if (!Array.isArray(manifest.assets)) return 'malformed';
  for (const asset of manifest.assets) {
    if (!PATH_RE.test(asset.path) || !SHA_RE.test(asset.sha256)) return 'malformed';
    if (!Number.isInteger(asset.size) || asset.size < 0) return 'malformed';
  }
  return null;
}
