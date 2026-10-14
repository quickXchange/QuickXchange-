/** A single flight, with an idempotent stop that drains it before resources close. */
export function startDrainingWorker(
  task: () => Promise<void>, intervalMs: number, onError: (error: unknown) => void,
): () => Promise<void> {
  let stopped = false;
  let flight: Promise<void> | undefined;
  const tick = () => {
    if (stopped || flight) return;
    const work = Promise.resolve().then(() => stopped ? undefined : task()).catch(onError);
    flight = work;
    void work.finally(() => { if (flight === work) flight = undefined; }).catch(() => {});
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await flight;
  };
}
