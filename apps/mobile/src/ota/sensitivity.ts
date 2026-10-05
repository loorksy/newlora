const reasons = new Set<string>();
const listeners = new Set<() => void>();

export function setSensitive(reason: string, active: boolean) {
  if (active) reasons.add(reason);
  else reasons.delete(reason);
  listeners.forEach(listener => listener());
}

export function sensitiveNow(): boolean {
  return reasons.size > 0;
}

export function subscribeSensitive(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
