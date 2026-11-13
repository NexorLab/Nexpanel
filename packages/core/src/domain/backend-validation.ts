import type { Backend } from "./types";

export type BackendValidationErrorCode =
  | "BACKEND_FRAGMENT_REQUIRES_TLS"
  | "BACKEND_ECH_REQUIRES_TLS"
  | "BACKEND_ECH_SERVER_NAME_REQUIRED";

export interface BackendValidationError {
  code: BackendValidationErrorCode;
  message: string;
}

/**
 * Validates cross-field Backend network settings.
 *
 * Raw field types, formats and numeric ranges are validated by the
 * API input parser.
 */
export function validateBackend(
  backend: Pick<Backend, "security" | "fragment" | "ech">,
): BackendValidationError | null {
  if (backend.fragment.mode === "custom" && backend.security === "none") {
    return {
      code: "BACKEND_FRAGMENT_REQUIRES_TLS",
      message: "Fragment requires TLS or Reality security.",
    };
  }

  if (backend.ech.enabled) {
    if (backend.security !== "tls") {
      return {
        code: "BACKEND_ECH_REQUIRES_TLS",
        message: "ECH requires TLS security.",
      };
    }

    if (backend.ech.serverName.trim().length === 0) {
      return {
        code: "BACKEND_ECH_SERVER_NAME_REQUIRED",
        message: "ECH requires a server name.",
      };
    }
  }

  return null;
}
