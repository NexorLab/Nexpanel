import type { ApiClient } from "./endpoints";
import { createMockAdapter } from "./mock/adapter";
import { createHttpAdapter } from "./real/adapter";

/**
 * Single API entry point used by all pages.
 *
 * Mock is the default; set VITE_API_MODE=real in apps/panel/.env.local
 * (or a deployed env var) to talk to the Workers API. Both adapters
 * implement the same ApiClient contract, so pages stay unchanged.
 */

const useMock = import.meta.env.VITE_API_MODE !== "real";

let client: ApiClient | null = null;

export function getApi(): ApiClient {
  if (!client) {
    client = useMock ? createMockAdapter() : createHttpAdapter();
  }
  return client;
}
