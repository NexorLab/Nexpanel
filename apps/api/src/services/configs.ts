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

/**
 * Rebuild every config derived from `backend`. Called after a backend
 * PATCH: configs.uri is denormalized, so a host/port/transport change
 * otherwise leaves every derived config pointing at stale coordinates,
 * and a status change would not be reflected until someone rebuilt them
 * by hand. Idempotent — upserts keep the existing ids.
 *
 * Returns full `Config` rows (timestamps preserved from the source rows)
 * so the result feeds straight into `configs.upsert`, which requires
 * createdAt/updatedAt.
 *
 * `getUser` is injected rather than taking the repository bundle, so the
 * service stays storage-agnostic (the Node SQLite port swaps in later).
 */
export async function rebuildBackendConfigs(
  configs: Config[],
  backend: Backend,
  getUser: (userId: string) => Promise<ConfigUser | null>,
): Promise<Config[]> {
  const cache = new Map<string, ConfigUser | null>();
  const rebuilt: Config[] = [];
  for (const config of configs) {
    let user = cache.get(config.userId);
    if (user === undefined) {
      user = await getUser(config.userId);
      cache.set(config.userId, user);
    }
    if (!user) continue;
    rebuilt.push({
      ...config, // keep id + timestamps; upsert updates the rest
      ...buildConfigPayload(user, backend),
      id: config.id, // upsert keeps the existing row (pair is UNIQUE)
    });
  }
  return rebuilt;
}