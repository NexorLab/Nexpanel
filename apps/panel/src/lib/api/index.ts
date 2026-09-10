import type { ApiClient } from "./endpoints";
import { createMockAdapter } from "./mock/adapter";

/**
 * Single API entry point used by all pages.
 *
 * Mock mode is the default until the backend phase lands; switch by
 * setting VITE_API_MODE=real in apps/panel/.env.local. The real HTTP
 * adapter will implement the same ApiClient interface.
 */

const useMock = import.meta.env.VITE_API_MODE !== "real";

let client: ApiClient | null = null;

export function getApi(): ApiClient {
  if (!client) {
    client = useMock ? createMockAdapter() : createMockAdapter();
    // ^ real adapter arrives with the backend phase; mock keeps the UI functional
  }
  return client;
}
