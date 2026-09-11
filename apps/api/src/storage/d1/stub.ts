import { AppError } from "@nexpanel/core";

/**
 * Placeholder for repositories whose schema exists (0001_init.sql) but
 * whose endpoints are still 501 — users, backends, configs, subscriptions,
 * stats. Every method throws NOT_IMPLEMENTED so the wire contract stays
 * observable until each is implemented in its own session.
 */
export function stubRepository<T extends object>(label: string): T {
  const notImplemented = (): never => {
    throw new AppError("NOT_IMPLEMENTED", 501, `${label} is not implemented yet.`);
  };
  return new Proxy({} as T, {
    get() {
      return notImplemented;
    },
  });
}
