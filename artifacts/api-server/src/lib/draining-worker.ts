import { databaseOperationContext, withDatabaseOperation } from "@workspace/db/operation-context";

/** A single flight, with an idempotent stop that drains it before resources close. */
export function startDrainingWorker(
  task: () => Promise<void>, intervalMs: number, onError: (error: unknown) => void,
  options: { startImmediately?: boolean; component?: string } = {},
): () => Promise<void> {
  let stopped = false;
  let flight: Promise<void> | undefined;
  const tick = () => {
    if (stopped || flight) return;
    const work = Promise.resolve().then(() => stopped ? undefined :
      withDatabaseOperation(options.component ?? databaseOperationContext.getStore() ?? "background-worker", task)).catch(onError);
    flight = work;
    void work.finally(() => { if (flight === work) flight = undefined; }).catch(() => {});
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  if (options.startImmediately !== false) tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await flight;
  };
}
