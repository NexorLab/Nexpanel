/// <reference types="@cloudflare/workers-types" />

import type { AdminRole } from "@nexpanel/core";

/**
 * Environment bindings for the NexPanel Worker.
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

/** Verified request identity — set by requireAuth, read by requireRole. */
export interface AuthState {
  adminId: string;
  username: string;
  /** DB-authoritative role (the JWT role claim is not trusted). */
  role: AdminRole;
}

/** Hono generic env: bindings from the runtime + typed context variables. */
export type AppEnv = {
  Bindings: Env;
  Variables: { auth: AuthState | null };
};
