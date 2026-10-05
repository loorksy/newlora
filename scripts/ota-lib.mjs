import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { etc, verify } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

etc.sha512Sync = sha512;

export function canonical(manifest) {
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
  const assets = [...(manifest.assets || [])].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const asset of assets) {
    lines.push(`asset=${asset.path}|${asset.sha256}|${asset.size}|${asset.url}`);
  }
  return lines.join('\n');
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyManifest(manifest, publicKeyHex) {
  const signature = Buffer.from(manifest.signature, 'base64');
  const key = Buffer.from(publicKeyHex, 'hex');
  return verify(signature, new TextEncoder().encode(canonical(manifest)), key);
}

const [command, file, extra, key] = process.argv.slice(2);
if (command === 'canonical') {
  process.stdout.write(canonical(JSON.parse(readFileSync(file, 'utf8'))));
} else if (command === 'sha256') {
  process.stdout.write(sha256Hex(readFileSync(file)));
} else if (command === 'verify') {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const bytes = readFileSync(extra);
  const hashOk = sha256Hex(bytes) === manifest.bundle.sha256 && bytes.length === manifest.bundle.size;
  const sigOk = verifyManifest(manifest, key);
  if (!hashOk || !sigOk) {
    process.stderr.write('rejected\n');
    process.exit(1);
  }
  process.stdout.write('ok\n');
}
