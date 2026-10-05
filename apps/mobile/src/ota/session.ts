import { useSyncExternalStore } from 'react';
import { emptyState, type OtaPhase, type OtaState } from './types';

export type OtaSession = {
  phase: OtaPhase;
  state: OtaState;
  check: () => Promise<void>;
  apply: () => Promise<void>;
  reset: () => Promise<void>;
  ready: boolean;
};

const listeners = new Set<() => void>();
let session: OtaSession = {
  phase: 'upToDate',
  state: emptyState(),
  check: async () => {},
  apply: async () => {},
  reset: async () => {},
  ready: false,
};

function emit() {
  listeners.forEach(listener => listener());
}

export function publishOta(next: OtaSession) {
  session = next;
  emit();
}

export function useOtaSession(): OtaSession {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
    () => session,
  );
}
