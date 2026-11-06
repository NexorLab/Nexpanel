import type { Backend } from "./types";

/**
 * Returns a domain validation message for incompatible Backend network
 * settings, or null when the settings are valid.
 *
 * This validates cross-field rules only. Raw field types, formats and
 * numeric ranges are validated by the API input parser.
 */
export function validateBackend(
  backend: Pick<Backend, "security" | "fragment" | "ech">,
): string | null {
  if (backend.fragment.mode === "custom" && backend.security === "none") {
    return "Fragment requires TLS or Reality security.";
  }

  if (backend.ech.enabled) {
    if (backend.security !== "tls") {
      return "ECH requires TLS security.";
    }

    if (backend.ech.serverName.trim().length === 0) {
      return "ECH requires a server name.";
    }
  }

  return null;
}