let depth = 0;
const listeners = new Set<(active: boolean) => void>();

function notify() {
  const active = depth > 0;
  listeners.forEach((fn) => fn(active));
}

export function mutationBusyStart() {
  depth += 1;
  notify();
}

export function mutationBusyEnd() {
  depth = Math.max(0, depth - 1);
  notify();
}

export function subscribeMutationBusy(fn: (active: boolean) => void): () => void {
  listeners.add(fn);
  fn(depth > 0);
  return () => listeners.delete(fn);
}

export function isMutationMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(m);
}
