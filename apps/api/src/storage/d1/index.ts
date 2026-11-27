import type { RepositoryBundle } from "@nexpanel/core";
import type { Env } from "../../env";
import { createAdminRepository } from "./admins";
import { createSettingsRepository } from "./settings";
import { createSessionRepository } from "./sessions";
import { createUserRepository } from "./users";
import { createBackendRepository } from "./backends";
import { validateBackendEncryptionKey } from "../../services/backend-crypto";
import { createConfigRepository } from "./configs";
import { createSubscriptionRepository } from "./subscriptions";
import { createStatsRepository } from "./stats";
import { createActivityRepository } from "./activity";

/**
 * D1 implementation of the RepositoryBundle. Constructed per request
 * from env.DB — cheap on Workers and keeps every handler DI-shaped, so
 * the future Node entry hands the same bundle backed by SQLite.
 */
export function createRepositories(env: Env): RepositoryBundle {
   validateBackendEncryptionKey(env.BACKEND_ENCRYPTION_KEY);

  return {
    users: createUserRepository(env.DB),
    backends: createBackendRepository(env.DB, env.BACKEND_ENCRYPTION_KEY),
    configs: createConfigRepository(env.DB),
    subscriptions: createSubscriptionRepository(env.DB),
    admins: createAdminRepository(env.DB),
    settings: createSettingsRepository(env.DB),
    sessions: createSessionRepository(env.DB),
    stats: createStatsRepository(env.DB),
    activity: createActivityRepository(env.DB),
  };
}
