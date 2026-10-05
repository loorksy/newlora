import { NativeModules } from 'react-native';
import { NATIVE_VERSION, VERSION_CODE } from './buildStamp';
import { decodeUtf8, encodeUtf8, fromBase64, toBase64 } from './codec';
import { emptyState, type OtaState } from './types';
import type { OtaFs } from './store';

type NativeOta = {
  readText(rel: string): Promise<string | null>;
  writeText(rel: string, text: string): Promise<boolean>;
  writeBytes(rel: string, base64: string): Promise<boolean>;
  readBytes(rel: string): Promise<string | null>;
  rename(from: string, to: string): Promise<boolean>;
  removeTree(rel: string): Promise<boolean>;
  reload(): Promise<boolean>;
};

export function otaNative(): NativeOta | null {
  const native = NativeModules.NewloraOta as NativeOta | undefined;
  if (!native || typeof native.readText !== 'function') return null;
  return native;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return toBase64(bytes);
}

export type NativeBuild = {
  versionName: string;
  versionCode: number;
  embeddedGitSha: string;
};

export function readNativeBuild(): NativeBuild {
  const native = NativeModules.NewloraOta as
    | { versionName?: string; versionCode?: number; embeddedGitSha?: string }
    | undefined;
  const versionCode = Number(native?.versionCode);
  return {
    versionName: native?.versionName || NATIVE_VERSION,
    versionCode: Number.isFinite(versionCode) && versionCode > 0 ? versionCode : VERSION_CODE,
    embeddedGitSha: typeof native?.embeddedGitSha === 'string' ? native.embeddedGitSha : '',
  };
}

export function bridgeFs(native: NativeOta): OtaFs {
  return {
    async readState() {
      const raw = await native.readText('state.json');
      if (!raw) return emptyState();
      return JSON.parse(raw) as OtaState;
    },
    async writeState(state) {
      await native.writeText('state.json', JSON.stringify(state));
    },
    async writeFileAtomic(rel, bytes) {
      if (rel.endsWith('.json') || rel.endsWith('.json.tmp')) {
        await native.writeText(rel, decodeUtf8(bytes));
        return;
      }
      await native.writeBytes(rel, bytesToBase64(bytes));
    },
    async readFile(rel) {
      if (rel.endsWith('.json')) {
        const text = await native.readText(rel);
        return text == null ? null : encodeUtf8(text);
      }
      const encoded = await native.readBytes(rel);
      if (!encoded) return null;
      return fromBase64(encoded);
    },
    async removeTree(rel) {
      await native.removeTree(rel);
    },
    async rename(from, to) {
      await native.rename(from, to);
    },
  };
}
