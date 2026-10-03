// Shared notification avoids a circular dependency between the Swap and feed routers.
const listeners = new Set<() => void>();
export function onBestchangeConfigurationChange(listener: () => void) {
  listeners.add(listener);
}
export function invalidateBestchangeFeed() {
  for (const listener of listeners) listener();
}