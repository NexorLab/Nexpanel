import { buildUri, type Backend, type Config, type ConfigUser } from "@nexpanel/core";

/**
 * Shared config-generation logic (vertical-slice service). Used by
 * POST /configs/generate, POST /configs/:id/rebuild and
 * POST /users/:id/reset-uuid — everywhere a config URI is (re)built.
 *
 * isActive mirrors the parents: a config is deliverable only while both
 * its user and backend are active. Rebuilding recomputes it.
 */
export function buildConfigPayload(
  user: ConfigUser,
  backend: Backend,
): Omit<Config, "createdAt" | "updatedAt"> {
  return {
    id: crypto.randomUUID(),
    userId: user.id,
    backendId: backend.id,
    protocol: backend.protocol,
    name: `${backend.name}-${backend.protocol}`,
    uri: buildUri(user, backend),
    isActive: user.status === "active" && backend.status === "active",
  };
}
