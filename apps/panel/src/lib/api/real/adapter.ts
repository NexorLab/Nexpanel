import type { ApiClient } from "../endpoints";
import type {
  AuthStatus,
  Backend,
  Config,
  ConfigUser,
  LoginResult,
  Paginated,
  PanelAdmin,
  PanelSettings,
  StatsOverview,
  Subscription,
  UserStatus,
} from "../../../types/dto";
import { ApiError, request } from "./http";

/**
 * Real HTTP implementation of ApiClient, backed by the Workers API
 * (docs/api.md). Enabled with VITE_API_MODE=real.
 *
 * Two deliberate translations keep the UI adapter-agnostic:
 * 1. The mock contract expresses quota in GB and expiry in days; the
 *    wire contract uses bytes and unix seconds.
 * 2. The UI's UserStatus has derived states (`expired`, `limited`) that
 *    the DB never stores — status is only `active`|`disabled`, so expired
 *    users are re-derived here from expiryAt.
 */

const BYTES_PER_GB = 1024 ** 3;

/** Re-derive the UI status: `expired` is not stored on the server. */
function adaptUser(user: ConfigUser): ConfigUser {
  if (user.status === "disabled") return user;
  if (user.expiryAt !== null && user.expiryAt <= Math.floor(Date.now() / 1000)) {
    return { ...user, status: "expired" satisfies UserStatus };
  }
  return user;
}

export function createHttpAdapter(): ApiClient {
  return {
    // auth — these are public routes; the token is not attached.
    async getAuthStatus(): Promise<AuthStatus> {
      return request<AuthStatus>("/auth/status");
    },

    async setup({ username, password }): Promise<LoginResult> {
      return request<LoginResult>("/auth/setup", {
        method: "POST",
        body: { username, password },
      });
    },

    async login({ username, password }): Promise<LoginResult> {
      return request<LoginResult>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
    },

    async logout(): Promise<void> {
      await request<void>("/auth/logout", { method: "POST", empty: true });
    },

    async changePassword({ currentPassword, newPassword }): Promise<void> {
      await request<void>("/auth/password", {
        method: "PATCH",
        body: { currentPassword, newPassword },
        empty: true,
      });
    },

    // stats
    async getStats(): Promise<StatsOverview> {
      return request<StatsOverview>("/stats/overview");
    },

    // users
    async listUsers(params) {
      const result = await request<Paginated<ConfigUser>>("/users", {
        params: {
          search: params.search,
          status: params.status === "all" ? undefined : params.status,
          page: params.page,
          perPage: params.perPage,
        },
      });
      return { ...result, data: result.data.map(adaptUser) };
    },

    async getUser(id) {
      return adaptUser(await request<ConfigUser>(`/users/${id}`));
    },

    async createUser(body) {
      const created = await request<ConfigUser>("/users", {
        method: "POST",
        body: {
          username: body.username,
          note: body.note ?? null,
          quotaBytes: Math.round((body.quotaGb ?? 0) * BYTES_PER_GB),
          expiryAt: body.expiryDays ? Math.floor(Date.now() / 1000) + body.expiryDays * 86400 : null,
          ipLimit: body.ipLimit ?? 0,
          status: body.enabled === false ? "disabled" : "active",
        },
      });
      return adaptUser(created);
    },

    async updateUser(id, body) {
      const updated = await request<ConfigUser>(`/users/${id}`, {
        method: "PATCH",
        body: {
          username: body.username,
          note: body.note,
          quotaBytes: body.quotaGb === undefined ? undefined : Math.round(body.quotaGb * BYTES_PER_GB),
          expiryAt: body.expiryAt,
          ipLimit: body.ipLimit,
          status: body.enabled === undefined ? undefined : body.enabled ? "active" : "disabled",
        },
      });
      return adaptUser(updated);
    },

    async deleteUser(id) {
      await request<void>(`/users/${id}`, { method: "DELETE", empty: true });
    },

    async resetUserUuid(id) {
      return adaptUser(await request<ConfigUser>(`/users/${id}/reset-uuid`, { method: "POST" }));
    },

    // backends
    async listBackends(params) {
      return request<Backend[]>("/backends", {
        params: {
          protocol: params?.protocol === "all" ? undefined : params?.protocol,
          status: params?.status === "all" ? undefined : params?.status,
        },
      });
    },

    async createBackend(body) {
      return request<Backend>("/backends", { method: "POST", body });
    },

    async updateBackend(id, body) {
      return request<Backend>(`/backends/${id}`, { method: "PATCH", body });
    },

    async deleteBackend(id) {
      await request<void>(`/backends/${id}`, { method: "DELETE", empty: true });
    },

    async testBackend(id) {
      return request<{ latencyMs: number }>(`/backends/${id}/test`, { method: "POST" });
    },

    // configs
    async listConfigs(params) {
      return request<Paginated<Config>>("/configs", {
        params: {
          userId: params?.userId === "all" ? undefined : params?.userId,
          backendId: params?.backendId === "all" ? undefined : params?.backendId,
          protocol: params?.protocol === "all" ? undefined : params?.protocol,
          search: params?.search,
          page: params?.page,
          perPage: params?.perPage,
        },
      });
    },

    async deleteConfig(id) {
      await request<void>(`/configs/${id}`, { method: "DELETE", empty: true });
    },

    async rebuildConfig(id) {
      return request<Config>(`/configs/${id}/rebuild`, { method: "POST" });
    },

    async generateConfigs(body) {
      return request<Config[]>("/configs/generate", {
        method: "POST",
        body,
      });
    },

    // subscriptions
    async listSubscriptions(params) {
      return request<Subscription[]>("/subscriptions", {
        params: { userId: params?.userId === "all" ? undefined : params?.userId },
      });
    },

    async createSubscription(body) {
      return request<Subscription>("/subscriptions", {
        method: "POST",
        body,
      });
    },

    async updateSubscription(id, body) {
      return request<Subscription>(`/subscriptions/${id}`, {
        method: "PATCH",
        body,
      });
    },

    async deleteSubscription(id) {
      await request<void>(`/subscriptions/${id}`, { method: "DELETE", empty: true });
    },

    async rotateSubscriptionToken(id) {
      return request<Subscription>(`/subscriptions/${id}/rotate-token`, { method: "POST" });
    },

    // settings
    async getSettings() {
      return request<PanelSettings>("/settings");
    },

    async updateSettings(body) {
      return request<PanelSettings>("/settings", { method: "PATCH", body });
    },

    // admins
    async listAdmins() {
      return request<PanelAdmin[]>("/admins");
    },

    async createAdmin(body) {
      return request<PanelAdmin>("/admins", { method: "POST", body });
    },

    async updateAdmin(id, body) {
      return request<PanelAdmin>(`/admins/${id}`, { method: "PATCH", body });
    },

    async deleteAdmin(id) {
      await request<void>(`/admins/${id}`, { method: "DELETE", empty: true });
    },
  };
}

export { ApiError };
