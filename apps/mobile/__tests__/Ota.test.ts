import { getPublicKey, sign, utils } from '@noble/ed25519';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { canonicalBytes } from '../src/ota/canonical';
import { decodeUtf8, encodeUtf8, fromBase64, toBase64 } from '../src/ota/codec';
import { OTA_VERIFICATION, runningBundle } from '../src/ota/diagnostics';
import { bridgeFs } from '../src/ota/native';

declare const __dirname: string;
import {
  checkUpdate,
  markHealthy,
  reloadAllowed,
  resetToEmbedded,
  resolveBoot,
  shouldCheck,
  stageRelease,
} from '../src/ota/engine';
import { memoryFs } from '../src/ota/store';
import {
  CHECK_INTERVAL_MS,
  RUNTIME_VERSION,
  emptyState,
  type OtaState,
  type ReleaseManifest,
} from '../src/ota/types';
import { bytesToHex, hexToBytes, sha256Hex } from '../src/ota/verify';

function b64(bytes: Uint8Array) {
  return toBase64(bytes);
}

async function keyPair() {
  const secret = utils.randomPrivateKey();
  return { secret, publicKey: getPublicKey(secret) };
}

function manifestFor(
  over: Partial<ReleaseManifest> & { bundleBytes?: Uint8Array },
  secret: Uint8Array,
): { manifest: ReleaseManifest; bytes: Uint8Array } {
  const bytes = over.bundleBytes ?? encodeUtf8('bundle-' + (over.id || 'release001'));
  const manifest: ReleaseManifest = {
    id: over.id ?? 'release001',
    channel: over.channel ?? 'preview',
    platform: 'android',
    version: over.version ?? '1.1',
    runtimeVersion: over.runtimeVersion ?? RUNTIME_VERSION,
    createdAt: over.createdAt ?? '2026-10-05T16:00:00Z',
    gitSha: over.gitSha ?? 'abc1234',
    bundle: {
      url:
        over.bundle?.url ??
        `https://newlora.lork.cloud/app-updates/android/${over.channel ?? 'preview'}/releases/${over.id ?? 'release001'}/bundle`,
      sha256: sha256Hex(bytes),
      size: bytes.byteLength,
      contentType: 'application/octet-stream',
    },
    assets: over.assets ?? [],
    notes: over.notes ?? 'note',
    signature: '',
  };
  manifest.signature = b64(sign(canonicalBytes(manifest), secret));
  return { manifest, bytes };
}

function response(body: string | Uint8Array, status = 200, type = 'application/json') {
  const bytes = typeof body === 'string' ? encodeUtf8(body) : body;
  return new Response(bytes, {
    status,
    headers: { 'content-type': type, 'content-length': String(bytes.byteLength) },
  });
}

test('canonical bytes match the publisher', () => {
  const manifest: ReleaseManifest = {
    id: 'release001',
    channel: 'preview',
    platform: 'android',
    version: '1.1',
    runtimeVersion: RUNTIME_VERSION,
    createdAt: '2026-10-05T16:00:00Z',
    gitSha: 'abc1234',
    bundle: {
      url: 'https://newlora.lork.cloud/app-updates/android/preview/releases/release001/bundle',
      sha256: 'ab'.repeat(32),
      size: 4,
      contentType: 'application/octet-stream',
    },
    assets: [],
    notes: 'note',
    signature: '',
  };
  const dir = mkdtempSync(path.join(tmpdir(), 'ota-canon-'));
  const file = path.join(dir, 'manifest.json');
  writeFileSync(file, JSON.stringify(manifest));
  const published = execFileSync('node', [path.join(__dirname, '../../../scripts/ota-lib.mjs'), 'canonical', file], {
    encoding: 'utf8',
  });
  expect(published).toBe(decodeURIComponent(Array.from(canonicalBytes(manifest), byte => '%' + byte.toString(16).padStart(2, '0')).join('')));
  rmSync(dir, { recursive: true, force: true });
});

test('no update keeps the embedded bundle', async () => {
  const { publicKey } = await keyPair();
  const fs = memoryFs();
  const result = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response('missing', 404, 'text/plain'),
  });
  expect(result.phase).toBe('upToDate');
  expect((await fs.readState()).good).toBeNull();
  expect(resolveBoot(await fs.readState()).source).toBe('embedded');
});

test('newer compatible release stages without replacing known-good', async () => {
  const { secret, publicKey } = await keyPair();
  const { manifest, bytes } = manifestFor({ id: 'release002', createdAt: '2026-10-05T18:00:00Z' }, secret);
  const fs = memoryFs({
    ...emptyState(),
    good: {
      id: 'release001',
      createdAt: '2026-10-05T16:00:00Z',
      runtimeVersion: RUNTIME_VERSION,
      gitSha: 'abc1234',
      version: '1.1',
      sha256: 'aa'.repeat(32),
      notes: '',
    },
  });
  const result = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async url =>
      String(url).endsWith('/manifest')
        ? response(JSON.stringify(manifest))
        : response(bytes, 200, 'application/octet-stream'),
  });
  const state = result.state;
  expect(result.phase).toBe('ready');
  expect(state.good?.id).toBe('release001');
  expect(state.pending?.id).toBe('release002');
  expect(bytesToHex((await fs.readFile('releases/release002/bundle'))!)).toBe(bytesToHex(bytes));
});

test('incompatible runtime is rejected and the installed bundle stays', async () => {
  const { secret, publicKey } = await keyPair();
  const { manifest } = manifestFor({ runtimeVersion: 'newlora-android-runtime-999' }, secret);
  const fs = memoryFs();
  const result = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response(JSON.stringify(manifest)),
  });
  expect(result.phase).toBe('apkRequired');
  expect(result.reason).toBe('runtime');
  expect((await fs.readState()).pending).toBeNull();
});

test('invalid signature and bad hash are rejected', async () => {
  const { secret, publicKey } = await keyPair();
  const other = await keyPair();
  const { manifest, bytes } = manifestFor({}, secret);
  manifest.signature = b64(sign(canonicalBytes({ ...manifest, signature: '' }), other.secret));
  const fs = memoryFs();
  const signed = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response(JSON.stringify(manifest)),
  });
  expect(signed.reason).toBe('signature');
  const good = manifestFor({ id: 'release009' }, secret);
  good.bytes[0] ^= 0xff;
  const hashed = await checkUpdate({
    fs: memoryFs(),
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async url =>
      String(url).endsWith('/manifest')
        ? response(JSON.stringify(good.manifest))
        : response(good.bytes, 200, 'application/octet-stream'),
  });
  expect(hashed.reason).toBe('hash');
  expect((await hashed.state).pending).toBeNull();
});

test('interrupted download leaves the current release in place', async () => {
  const fs = memoryFs();
  await fs.writeFileAtomic('partial/release004/bundle', encodeUtf8('partial'));
  const boot = resolveBoot(await fs.readState());
  expect(boot.source).toBe('embedded');
  expect((await fs.readState()).pending).toBeNull();
  expect(await fs.readFile('partial/release004/bundle')).not.toBeNull();
});

test('atomic install then healthy boot promotes pending and a failed boot rolls back', async () => {
  const { secret, publicKey } = await keyPair();
  const { manifest, bytes } = manifestFor({ id: 'release005', notes: 'proof-b' }, secret);
  const fs = memoryFs();
  let state = await stageRelease(fs, emptyState(), manifest, bytes, publicKey);
  expect(state.good).toBeNull();
  expect(state.pending?.id).toBe('release005');
  let boot = resolveBoot(state);
  state = markHealthy(boot.state);
  expect(state.good?.id).toBe('release005');
  expect(state.pending).toBeNull();
  expect(state.healthy).toBe(true);

  const next = manifestFor(
    { id: 'release006', createdAt: '2026-10-05T19:00:00Z', notes: 'next' },
    secret,
  );
  state = await stageRelease(fs, state, next.manifest, next.bytes, publicKey);
  boot = resolveBoot(state);
  boot = resolveBoot(boot.state);
  const rolled = resolveBoot(boot.state);
  expect(rolled.source).toBe('good');
  expect(rolled.state.pending).toBeNull();
  expect(rolled.state.good?.id).toBe('release005');
  expect(rolled.state.lastError).toBe('rolledBack');
});

test('offline startup and a failed check do not drop the known-good bundle', async () => {
  const state: OtaState = {
    ...emptyState(),
    good: {
      id: 'release001',
      createdAt: '2026-10-05T16:00:00Z',
      runtimeVersion: RUNTIME_VERSION,
      gitSha: 'abc1234',
      version: '1.1',
      sha256: 'ab'.repeat(32),
      notes: '',
    },
  };
  expect(resolveBoot(state).source).toBe('good');
  const { publicKey } = await keyPair();
  const fs = memoryFs(state);
  const result = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  expect(result.reason).toBe('offline');
  expect(result.state.good?.id).toBe('release001');
  expect(result.state.pending).toBeNull();
});

test('foreground checks immediately and the interval waits', () => {
  const now = Date.parse('2026-10-05T16:30:00Z');
  const recent = '2026-10-05T16:20:00Z';
  expect(shouldCheck('startup', recent, now)).toBe(true);
  expect(shouldCheck('foreground', recent, now)).toBe(true);
  expect(shouldCheck('manual', recent, now)).toBe(true);
  expect(shouldCheck('interval', recent, now)).toBe(false);
  expect(shouldCheck('interval', recent, now + CHECK_INTERVAL_MS)).toBe(true);
});

test('active chat, voice, upload, and credential submit block reload', () => {
  const idle = { typing: false, uploading: false, streaming: false, voice: false, submitting: false };
  expect(reloadAllowed(idle)).toBe(true);
  expect(reloadAllowed({ ...idle, streaming: true })).toBe(false);
  expect(reloadAllowed({ ...idle, voice: true })).toBe(false);
  expect(reloadAllowed({ ...idle, typing: true })).toBe(false);
  expect(reloadAllowed({ ...idle, uploading: true })).toBe(false);
  expect(reloadAllowed({ ...idle, submitting: true })).toBe(false);
});

test('manual check can be requested on top of an idle state', async () => {
  const { publicKey } = await keyPair();
  const fs = memoryFs();
  const result = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response('{}', 404, 'application/json'),
  });
  expect(result.phase).toBe('upToDate');
  expect(result.state.lastCheckedAt).toBeTruthy();
});

test('preview client rejects a stable manifest and a downgrade', async () => {
  const { secret, publicKey } = await keyPair();
  const stable = manifestFor({ channel: 'stable', id: 'stable0001' }, secret);
  const fs = memoryFs();
  const channel = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response(JSON.stringify(stable.manifest)),
  });
  expect(channel.reason).toBe('channel');
  const older = manifestFor({ id: 'release000', createdAt: '2026-10-04T16:00:00Z' }, secret);
  const base = memoryFs({
    ...emptyState(),
    good: {
      id: 'release001',
      createdAt: '2026-10-05T16:00:00Z',
      runtimeVersion: RUNTIME_VERSION,
      gitSha: 'abc1234',
      version: '1.1',
      sha256: 'ab'.repeat(32),
      notes: '',
    },
  });
  const downgrade = await checkUpdate({
    fs: base,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'https://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response(JSON.stringify(older.manifest)),
  });
  expect(downgrade.reason).toBe('downgrade');
});

test('reset returns to the embedded bundle without deleting the previous record', async () => {
  const state = resetToEmbedded({
    ...emptyState(),
    good: {
      id: 'release001',
      createdAt: '2026-10-05T16:00:00Z',
      runtimeVersion: RUNTIME_VERSION,
      gitSha: 'abc1234',
      version: '1.1',
      sha256: 'ab'.repeat(32),
      notes: '',
    },
  });
  expect(state.good).toBeNull();
  expect(state.previous?.id).toBe('release001');
  expect(resolveBoot(state).source).toBe('embedded');
});

test('the updater does not eval source or accept a bundle from a websocket', () => {
  const source = readFileSync(path.join(__dirname, '../src/ota/engine.ts'), 'utf8');
  expect(source.includes('eval(')).toBe(false);
  expect(source.includes('WebSocket')).toBe(false);
  expect(source.includes('new Function')).toBe(false);
});

test('hermes bytecode is stored without a utf-8 decode', async () => {
  const hermes = Uint8Array.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f, 0x00]);
  expect(() => decodeUtf8(hermes)).toThrow();
  const files = new Map<string, string>();
  const fs = bridgeFs({
    readText: async rel => files.get(rel) ?? null,
    writeText: async (rel, text) => {
      files.set(rel, text);
      return true;
    },
    writeBytes: async (rel, encoded) => {
      files.set(rel, encoded);
      return true;
    },
    readBytes: async rel => files.get(rel) ?? null,
    rename: async (from, to) => {
      const moving = [...files.keys()].filter(key => key === from || key.startsWith(`${from}/`));
      for (const key of moving) {
        files.set(to + key.slice(from.length), files.get(key) || '');
        files.delete(key);
      }
      return true;
    },
    removeTree: async rel => {
      for (const key of [...files.keys()]) {
        if (key === rel || key.startsWith(`${rel}/`)) files.delete(key);
      }
      return true;
    },
    reload: async () => true,
  });
  await fs.writeFileAtomic('partial/release001/bundle', hermes);
  const stored = files.get('partial/release001/bundle');
  expect(stored ? fromBase64(stored) : null).toEqual(hermes);
});

test('the running bundle source follows the native boot record', () => {
  expect(runningBundle(emptyState())).toEqual({ source: 'embedded', updateId: '' });
  expect(
    runningBundle({
      ...emptyState(),
      launchSource: 'good',
      launchedId: '20261005T180010Z-f05976f998c4',
      pending: {
        id: 'newer-release',
        createdAt: '2026-10-05T18:00:00Z',
        runtimeVersion: RUNTIME_VERSION,
        gitSha: 'abc1234',
        version: '1.2',
        sha256: 'ab'.repeat(32),
        notes: '',
      },
    }),
  ).toEqual({ source: 'ota', updateId: '20261005T180010Z-f05976f998c4' });
  expect(OTA_VERIFICATION).toBe('NANOBOT-UI-OTA-2');
});

test('a foreign host and a non-https manifest are rejected', async () => {
  const { publicKey } = await keyPair();
  const fs = memoryFs();
  const result = await checkUpdate({
    fs,
    publicKey,
    channel: 'preview',
    runtimeVersion: RUNTIME_VERSION,
    manifestUrl: 'http://newlora.lork.cloud/app-updates/android/preview/manifest',
    fetchImpl: async () => response('{}'),
  });
  expect(result.reason).toBe('host');
  expect(hexToBytes('aa').length).toBe(1);
});
