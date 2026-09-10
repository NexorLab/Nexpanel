import type { Context } from "hono";

/**
 * Unified error envelope. Every failure the API returns looks like:
 *
 * ```json
 * { "error": { "code": "NOT_IMPLEMENTED", "message": "..." } }
 * ```
 *
 * Codes are stable machine identifiers (see docs/api.md) — the frontend
 * maps them to translated messages.
 */

/** Error codes that the panel frontend can match on. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "USERNAME_TAKEN"
  | "NAME_TAKEN"
  | "LAST_OWNER"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

export function jsonError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 501,
  code: ErrorCode,
  message: string,
): Response {
  return c.json(errorBody(code, message), status);
}

/** Standard 501 placeholder used by every stubbed route in this phase. */
export function notImplemented(c: Context, endpoint: string): Response {
  return jsonError(
    c,
    501,
    "NOT_IMPLEMENTED",
    `${endpoint} is not implemented yet — see docs/api.md for the planned contract.`,
  );
}
