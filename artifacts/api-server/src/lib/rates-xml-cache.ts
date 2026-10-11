const listeners = new Set<() => void>();

export function onRatesXmlChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyRatesXmlChange() {
  for (const listener of listeners) listener();
}
