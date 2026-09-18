/**
 * @nexpanel/core — shared, environment-agnostic building blocks.
 *
 * Everything in this package must run identically on Cloudflare Workers
 * (WinterCG-compatible Web APIs only) and Node — no Node built-ins, no
 * DOM APIs. This constraint is what keeps the self-hosted migration
 * a drop-in swap (docs/architecture.md).
 */

export const NEX_PANEL_VERSION = "0.1.0";

/** Proxy protocols supported by config generation. */
export type Protocol = "vless" | "vmess" | "trojan" | "shadowsocks";

/** Transport carried in the URI query string. */
export type Transport = "tcp" | "ws" | "grpc" | "httpupgrade" | "xhttp";

/** TLS layer applied on top of the transport. */
export type Security = "none" | "tls" | "reality";

/** Admin roles, ordered owner > admin > viewer. */
export type AdminRole = "owner" | "admin" | "viewer";

export const PROTOCOLS: readonly Protocol[] = [
  "vless",
  "vmess",
  "trojan",
  "shadowsocks",
] as const;

export const ROLE_RANK: Record<AdminRole, number> = {
  owner: 3,
  admin: 2,
  viewer: 1,
};

/** Domain error with a stable machine code (frontend maps it to i18n). */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super("NOT_FOUND", 404, `${entity} not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(code: "USERNAME_TAKEN" | "NAME_TAKEN" | "LAST_OWNER", message: string) {
    super(code, 409, message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", 400, message);
  }
}

export * from "./domain/types";
export * from "./protocols/uri";
export * from "./crypto/passwords";
export * from "./crypto/jwt";
export * from "./crypto/hash";
export * from "./settings";
export * from "./storage/repository";
