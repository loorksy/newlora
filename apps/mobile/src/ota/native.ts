import { NativeModules } from 'react-native';
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
      const text = decodeUtf8(bytes);
      if (rel.endsWith('.json') || rel.endsWith('.json.tmp')) {
        await native.writeText(rel, text);
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
