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
  | "SETUP_ALREADY_DONE"
  | "WRONG_PASSWORD"
  | "INVALID_FRAGMENT_LENGTH"
  | "INVALID_FRAGMENT_DELAY"
  | "INVALID_FRAGMENT_SPLIT"
  | "INVALID_PORTS"
  | "INVALID_PING_INTERVAL"
  | "INVALID_DOH_URL"
  | "INVALID_ECH_SERVER_NAME"
  | "FRAGMENT_ECH_CONFLICT"
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

/** Map an AppError status onto Hono's contentful status code union. */
function toStatus(status: number): 400 | 401 | 403 | 404 | 409 | 429 | 500 | 501 {
  const allowed = [400, 401, 403, 404, 409, 429, 500, 501] as const;
  return (allowed as readonly number[]).includes(status)
    ? (status as (typeof allowed)[number])
    : 500;
}

/** Convert a thrown AppError into the standard envelope (app.onError). */
export function appErrorResponse(c: Context, error: { code: string; status: number; message: string }): Response {
  return c.json(errorBody(error.code as ErrorCode, error.message), toStatus(error.status));
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
