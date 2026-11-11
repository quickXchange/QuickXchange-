import { AsyncLocalStorage } from "node:async_hooks";

// Labels are application-owned component names, never SQL, parameters or user data.
export const databaseOperationContext = new AsyncLocalStorage<string>();

export function withDatabaseOperation<T>(component: string, work: () => T): T {
  return databaseOperationContext.run(component, work);
}
