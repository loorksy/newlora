import { etc, verify } from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { canonicalBytes, malformedReason } from './canonical';
import { fromBase64 } from './codec';
import { OTA_HOST, type ReleaseManifest } from './types';

etc.sha512Sync = sha512;

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('malformed');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error('malformed');
    out[i] = byte;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

function decodeSignature(signature: string): Uint8Array | null {
  const out = fromBase64(signature);
  return out && out.length === 64 ? out : null;
}

export function signatureValid(manifest: ReleaseManifest, publicKey: Uint8Array): boolean {
  const signature = decodeSignature(manifest.signature);
  if (!signature || publicKey.length !== 32) return false;
  try {
    return verify(signature, canonicalBytes(manifest), publicKey);
  } catch {
    return false;
  }
}

export function bundleUrlFor(channel: string, id: string): string {
  return `https://${OTA_HOST}/app-updates/android/${channel}/releases/${id}/bundle`;
}

export function urlAllowed(url: string, channel: string, id: string, kind: 'bundle' | 'manifest'): string | null {
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?$/.exec(url);
  if (!match || match[1].includes('@') || match[1].includes(':')) return 'host';
  if (match[1] !== OTA_HOST) return 'host';
  const path = match[2] || '/';
  const expected =
    kind === 'manifest'
      ? `/app-updates/android/${channel}/manifest`
      : `/app-updates/android/${channel}/releases/${id}/bundle`;
  if (path !== expected) return 'host';
  return null;
}

export type RejectReason =
  | 'malformed'
  | 'signature'
  | 'runtime'
  | 'channel'
  | 'host'
  | 'downgrade'
  | 'replay'
  | 'hash'
  | 'size'
  | 'type';

export function assessManifest(
  manifest: ReleaseManifest,
  publicKey: Uint8Array,
  expected: { channel: string; runtimeVersion: string; goodCreatedAt?: string | null; goodId?: string | null },
): RejectReason | 'install' | 'current' {
  const malformed = malformedReason(manifest);
  if (malformed) return 'malformed';
  if (urlAllowed(manifest.bundle.url, manifest.channel, manifest.id, 'bundle')) return 'host';
  if (manifest.bundle.url !== bundleUrlFor(manifest.channel, manifest.id)) return 'host';
  if (!signatureValid(manifest, publicKey)) return 'signature';
  if (manifest.runtimeVersion !== expected.runtimeVersion) return 'runtime';
  if (manifest.channel !== expected.channel) return 'channel';
  if (expected.goodId && manifest.id === expected.goodId) return 'current';
  if (expected.goodCreatedAt && manifest.createdAt < expected.goodCreatedAt) return 'downgrade';
  if (expected.goodCreatedAt && manifest.createdAt === expected.goodCreatedAt) return 'replay';
  return 'install';
}
