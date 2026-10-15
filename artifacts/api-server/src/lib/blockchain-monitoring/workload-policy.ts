export type MonitoringWorkload = {
  activeWatches: boolean;
  pendingEvidence: boolean;
  registrationGaps: boolean;
  manualReadiness: boolean;
};

/** Saved tracking intent alone does not make WhiteBIT use a Manual wallet. */
export function requiresManualMonitoringReadiness(route: {
  depositProvider: string | null | undefined;
  manualFallbackEnabled: boolean | null | undefined;
  manualWalletTrackingEnabled: boolean | null | undefined;
}): boolean {
  return route.manualWalletTrackingEnabled === true &&
    (route.depositProvider === "manual" ||
      route.depositProvider === "whitebit" && route.manualFallbackEnabled === true);
}

export function hasMonitoringWorkload(workload: MonitoringWorkload): boolean {
  return workload.activeWatches || workload.pendingEvidence ||
    workload.registrationGaps || workload.manualReadiness;
}

export function monitoringCadenceMs(pollSeconds: number, workload: MonitoringWorkload): number {
  const configured = Number.isSafeInteger(pollSeconds) && pollSeconds >= 5 ? pollSeconds * 1000 : 15_000;
  const base = Math.max(15_000, configured);
  if (workload.activeWatches || workload.pendingEvidence || workload.registrationGaps) return base;
  // 60 seconds stays within the existing max(120s, poll*3) readiness fence.
  return Math.max(base, workload.manualReadiness ? 60_000 : 300_000);
}

export function monitoringCycleDue(input: {
  now: number;
  nextAttemptAt: Date | null;
  healthStatus: string;
  healthCheckedAt: Date | null;
  pollSeconds: number;
  workload: MonitoringWorkload;
}): boolean {
  // Preserve configuration and let old readiness proofs expire normally.
  // WhiteBIT-only routes do not need periodic chain health probes.
  if (!hasMonitoringWorkload(input.workload)) return false;
  if (!input.nextAttemptAt || input.nextAttemptAt.getTime() <= input.now) return true;
  // A watch arriving during an idle interval must wake the network at its
  // normal cadence. Never bypass a disconnected provider's quota/backoff.
  if (input.healthStatus !== "connected" || !input.healthCheckedAt) return false;
  if (!input.workload.activeWatches && !input.workload.pendingEvidence &&
    !input.workload.registrationGaps && !input.workload.manualReadiness) return false;
  return input.now - input.healthCheckedAt.getTime() >= monitoringCadenceMs(input.pollSeconds, input.workload);
}
