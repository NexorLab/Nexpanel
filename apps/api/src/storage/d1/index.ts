import type { RepositoryBundle } from "@nexpanel/core";
import type { Env } from "../../env";
import { createAdminRepository } from "./admins";
import { createSettingsRepository } from "./settings";
import { createSessionRepository } from "./sessions";
import { stubRepository } from "./stub";

/**
 * D1 implementation of the RepositoryBundle. Constructed per request
 * from env.DB — cheap on Workers and keeps every handler DI-shaped, so
 * the future Node entry hands the same bundle backed by SQLite.
 */
export function createRepositories(env: Env): RepositoryBundle {
  return {
    users: stubRepository("UsersRepository"),
    backends: stubRepository("BackendsRepository"),
    configs: stubRepository("ConfigsRepository"),
    subscriptions: stubRepository("SubscriptionsRepository"),
    stats: stubRepository("StatsRepository"),
    admins: createAdminRepository(env.DB),
    settings: createSettingsRepository(env.DB),
    sessions: createSessionRepository(env.DB),
  };
}
