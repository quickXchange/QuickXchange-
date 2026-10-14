/**
 * Start verification immediately (so its synchronous safety fence runs before
 * serving requests), but never make unrelated API startup wait for the network.
 */
export function startBackgroundVerification(
  verify: () => Promise<boolean>,
  successDelayMs: number,
  failureDelayMs: number,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (verified: boolean) => {
    if (stopped) return;
    timer = setTimeout(run, verified ? successDelayMs : failureDelayMs);
    timer.unref();
  };
  const run = () => {
    if (stopped) return;
    try {
      void verify().then(schedule, () => schedule(false));
    } catch {
      schedule(false);
    }
  };
  run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
