import { decodeUtf8, encodeUtf8 } from './codec';
import {
  emptyState,
  type InstalledRelease,
  type LaunchSource,
  type OtaState,
  type ReleaseManifest,
} from './types';

export interface OtaFs {
  readState(): Promise<OtaState>;
  writeState(state: OtaState): Promise<void>;
  writeFileAtomic(rel: string, bytes: Uint8Array): Promise<void>;
  readFile(rel: string): Promise<Uint8Array | null>;
  removeTree(rel: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

type Node = { kind: 'file'; bytes: Uint8Array } | { kind: 'dir' };

export function memoryFs(initial?: OtaState): OtaFs & { snapshot(): Map<string, Uint8Array> } {
  const files = new Map<string, Node>();
  files.set('state.json', {
    kind: 'file',
    bytes: encodeUtf8(JSON.stringify(initial ?? emptyState())),
  });
  const normalize = (rel: string) => {
    if (!rel || rel.startsWith('/') || rel.split('/').some(part => part === '..' || part === '')) {
      throw new Error('path');
    }
    return rel;
  };
  return {
    snapshot() {
      const out = new Map<string, Uint8Array>();
      for (const [key, value] of files) {
        if (value.kind === 'file') out.set(key, value.bytes);
      }
      return out;
    },
    async readState() {
      const file = files.get('state.json');
      if (!file || file.kind !== 'file') return emptyState();
      return JSON.parse(decodeUtf8(file.bytes)) as OtaState;
    },
    async writeState(state) {
      const tmp = 'state.json.tmp';
      files.set(tmp, { kind: 'file', bytes: encodeUtf8(JSON.stringify(state)) });
      files.set('state.json', files.get(tmp)!);
      files.delete(tmp);
    },
    async writeFileAtomic(rel, bytes) {
      const path = normalize(rel);
      files.set(path + '.tmp', { kind: 'file', bytes: Uint8Array.from(bytes) });
      files.set(path, files.get(path + '.tmp')!);
      files.delete(path + '.tmp');
    },
    async readFile(rel) {
      const file = files.get(normalize(rel));
      return file && file.kind === 'file' ? file.bytes : null;
    },
    async removeTree(rel) {
      const path = normalize(rel);
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(path + '/')) files.delete(key);
      }
    },
    async rename(from, to) {
      const source = normalize(from);
      const target = normalize(to);
      const moving = [...files.keys()].filter(key => key === source || key.startsWith(source + '/'));
      if (!moving.length) throw new Error('missing');
      for (const key of moving) {
        const next = target + key.slice(source.length);
        files.set(next, files.get(key)!);
        files.delete(key);
      }
    },
  };
}

export function installedFrom(manifest: ReleaseManifest): InstalledRelease {
  return {
    id: manifest.id,
    createdAt: manifest.createdAt,
    runtimeVersion: manifest.runtimeVersion,
    gitSha: manifest.gitSha,
    version: manifest.version,
    sha256: manifest.bundle.sha256,
    notes: manifest.notes,
  };
}

export function releaseBundlePath(id: string): string {
  return `releases/${id}/bundle`;
}

export function describeLaunch(source: LaunchSource, state: OtaState): string | null {
  if (source === 'pending') return state.pending?.id ?? null;
  if (source === 'good') return state.good?.id ?? null;
  return null;
}
