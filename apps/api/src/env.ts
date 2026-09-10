/// <reference types="@cloudflare/workers-types" />

/**
 * Environment bindings for the NexPanel Worker.
 *
 * Phase 7 skeleton: the D1 binding and JWT secret are declared here so the
 * shape of every handler is already final; only the implementations are
 * stubbed with 501 NOT_IMPLEMENTED.
 */
export interface Env {
  /** D1 database binding (wrangler.jsonc → d1_databases). */
  DB: D1Database;

  /** HMAC secret for JWT signing (Worker secret, never in wrangler.jsonc). */
  JWT_SECRET: string;

  /**
   * Public origin that serves subscription links, e.g.
   * https://panel.example.com — used to build /sub/:token URLs.
   */
  PUBLIC_ORIGIN?: string;

  /** Durable object / KV namespaces reserved for future rate limiting. */
  RATE_LIMITER?: unknown;
}

export type EnvBinding = keyof Env;
