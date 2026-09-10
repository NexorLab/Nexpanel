import type { ApiClient } from "../endpoints";
import type {
  Backend,
  Config,
  ConfigUser,
  PanelAdmin,
  StatsOverview,
  Subscription,
} from "../../../types/dto";
import {
  buildSeedConfigs,
  buildSeedStats,
  seedAdmins,
  seedBackends,
  seedSubscriptions,
  seedUsers,
} from "./seed";

/**
 * In-memory implementation of ApiClient.
 * Simulates network latency and mirrors what the real backend will do,
 * including duplicate-name conflicts and pagination.
 */

const LATENCY_MS = 220;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    window.setTimeout(() => resolve(value), LATENCY_MS),
  );
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomUuid(): string {
  return crypto.randomUUID();
}

function paginate<T>(items: T[], page = 1, perPage = 20) {
  const total = items.length;
  const start = (page - 1) * perPage;
  return {
    data: items.slice(start, start + perPage),
    meta: { page, perPage, total },
  };
}

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export function createMockAdapter(): ApiClient {
  // Module-level state lives for the SPA session (reset on reload).
  let users: ConfigUser[] = seedUsers.map((user) => ({ ...user }));
  let backends: Backend[] = seedBackends.map((backend) => ({ ...backend }));
  let configs: Config[] = buildSeedConfigs(users);
  let admins: PanelAdmin[] = seedAdmins.map((admin) => ({ ...admin }));
  let subscriptions: Subscription[] = seedSubscriptions.map(
    (sub, index): Subscription => ({
      ...sub,
      userId: users[index % users.length].id,
    }),
  );

  function assertUniqueUsername(username: string, exceptId?: string) {
    const clash = users.some(
      (user) =>
        user.id !== exceptId && user.username.toLowerCase() === username.toLowerCase(),
    );
    if (clash) throw new ConflictError("USERNAME_TAKEN");
  }

  function assertUniqueBackendName(name: string, exceptId?: string) {
    const clash = backends.some(
      (backend) =>
        backend.id !== exceptId && backend.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw new ConflictError("NAME_TAKEN");
  }

  function buildUri(user: ConfigUser, backend: Backend): string {
    const params = new URLSearchParams();
    if (backend.protocol === "vmess") {
      const payload = {
        v: "2",
        ps: `NexPanel-${backend.name}`,
        add: backend.host,
        port: backend.port,
        id: user.uuid,
        aid: 0,
        net: backend.transport,
        type: "none",
        host: backend.hostHeader ?? "",
        path: backend.path ?? "",
        tls: backend.security === "none" ? "" : backend.security,
      };
      return `vmess://${btoa(JSON.stringify(payload))}`;
    }

    if (backend.protocol === "shadowsocks") {
      const userInfo = btoa(`${backend.method}:${backend.password}`);
      return `ss://${userInfo.replace(/=+$/, "")}@${backend.host}:${backend.port}#NexPanel-${backend.name}`;
    }

    if (backend.transport !== "tcp") params.set("type", backend.transport);
    if (backend.security !== "none") params.set("security", backend.security);
    if (backend.sni) params.set("sni", backend.sni);
    if (backend.hostHeader) params.set("host", backend.hostHeader);
    if (backend.path) params.set("path", backend.path);
    if (backend.serviceName) params.set("serviceName", backend.serviceName);
    if (backend.fingerprint) params.set("fp", backend.fingerprint);
    const scheme = backend.protocol === "trojan" ? "trojan" : "vless";
    const query = params.toString();
    return `${scheme}://${user.uuid}@${backend.host}:${backend.port}${query ? `?${query}` : ""}#NexPanel-${backend.name}`;
  }

  return {
    async getStats(): Promise<StatsOverview> {
      return delay(buildSeedStats(users, backends, configs, subscriptions));
    },

    async listUsers({ search, status, page = 1, perPage = 20 } = {}) {
      let result = [...users];
      if (search) {
        const needle = search.toLowerCase();
        result = result.filter(
          (user) =>
            user.username.toLowerCase().includes(needle) ||
            (user.note ?? "").toLowerCase().includes(needle),
        );
      }
      if (status && status !== "all") {
        result = result.filter((user) => user.status === status);
      }
      result.sort((a, b) => b.createdAt - a.createdAt);
      return delay(paginate(result, page, perPage));
    },

    async getUser(id) {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) throw new NotFoundError("USER_NOT_FOUND");
      return delay({ ...user });
    },

    async createUser({ username, note, quotaGb = 0, expiryDays, ipLimit = 0, enabled = true }) {
      assertUniqueUsername(username);
      const user: ConfigUser = {
        id: `u-${crypto.randomUUID().slice(0, 8)}`,
        uuid: randomUuid(),
        username,
        note: note ?? null,
        status: enabled ? "active" : "disabled",
        quotaBytes: Math.round(quotaGb * 1024 ** 3),
        usedBytes: 0,
        expiryAt: expiryDays ? now() + expiryDays * 86400 : null,
        ipLimit,
        createdAt: now(),
        updatedAt: now(),
      };
      users = [user, ...users];
      return delay({ ...user });
    },

    async updateUser(id, body) {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) throw new NotFoundError("USER_NOT_FOUND");
      if (body.username) assertUniqueUsername(body.username, id);

      if (body.username !== undefined) user.username = body.username;
      if (body.note !== undefined) user.note = body.note;
      if (body.quotaGb !== undefined) user.quotaBytes = Math.round(body.quotaGb * 1024 ** 3);
      if (body.expiryAt !== undefined) user.expiryAt = body.expiryAt;
      if (body.ipLimit !== undefined) user.ipLimit = body.ipLimit;
      if (body.enabled !== undefined) {
        user.status = body.enabled ? "active" : "disabled";
      }
      user.updatedAt = now();
      return delay({ ...user });
    },

    async deleteUser(id) {
      users = users.filter((user) => user.id !== id);
      configs = configs.filter((config) => config.userId !== id);
      subscriptions = subscriptions.filter((sub) => sub.userId !== id);
      return delay(undefined);
    },

    async resetUserUuid(id) {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) throw new NotFoundError("USER_NOT_FOUND");
      user.uuid = randomUuid();
      // Regenerate URIs so existing configs point at the new uuid
      configs = configs.map((config) => {
        if (config.userId !== id) return config;
        const backend = backends.find((candidate) => candidate.id === config.backendId);
        return backend
          ? { ...config, uri: buildUri(user, backend), lastGeneratedAt: now() }
          : config;
      });
      user.updatedAt = now();
      return delay({ ...user });
    },

    async listBackends({ protocol, status } = {}) {
      let result = [...backends];
      if (protocol && protocol !== "all") {
        result = result.filter((backend) => backend.protocol === protocol);
      }
      if (status && status !== "all") {
        result = result.filter((backend) => backend.status === status);
      }
      result.sort((a, b) => a.sortOrder - b.sortOrder);
      return delay(result);
    },

    async createBackend(body) {
      assertUniqueBackendName(body.name);
      const backend: Backend = {
        ...body,
        id: `b-${crypto.randomUUID().slice(0, 8)}`,
        sortOrder: backends.length + 1,
        createdAt: now(),
        updatedAt: now(),
      };
      backends = [...backends, backend];
      return delay({ ...backend });
    },

    async updateBackend(id, body) {
      const backend = backends.find((candidate) => candidate.id === id);
      if (!backend) throw new NotFoundError("BACKEND_NOT_FOUND");
      if (body.name) assertUniqueBackendName(body.name, id);

      Object.assign(backend, body, { updatedAt: now() });

      // Refresh URIs of derived configs
      configs = configs.map((config) => {
        if (config.backendId !== id) return config;
        const user = users.find((candidate) => candidate.id === config.userId);
        return user
          ? { ...config, uri: buildUri(user, backend), lastGeneratedAt: now() }
          : config;
      });

      return delay({ ...backend });
    },

    async deleteBackend(id) {
      backends = backends.filter((backend) => backend.id !== id);
      configs = configs.filter((config) => config.backendId !== id);
      return delay(undefined);
    },

    async testBackend(id) {
      const backend = backends.find((candidate) => candidate.id === id);
      if (!backend) throw new NotFoundError("BACKEND_NOT_FOUND");
      return delay({ latencyMs: 40 + Math.floor(Math.random() * 160) });
    },

    async listConfigs({ userId, backendId, protocol, search, page = 1, perPage = 20 } = {}) {
      let result = [...configs];
      if (userId && userId !== "all") {
        result = result.filter((config) => config.userId === userId);
      }
      if (backendId && backendId !== "all") {
        result = result.filter((config) => config.backendId === backendId);
      }
      if (protocol && protocol !== "all") {
        result = result.filter((config) => config.protocol === protocol);
      }
      if (search) {
        const needle = search.toLowerCase();
        result = result.filter(
          (config) =>
            config.name.toLowerCase().includes(needle) ||
            config.uri.toLowerCase().includes(needle),
        );
      }
      result.sort((a, b) => b.createdAt - a.createdAt);
      return delay(paginate(result, page, perPage));
    },

    async deleteConfig(id) {
      configs = configs.filter((config) => config.id !== id);
      return delay(undefined);
    },

    async rebuildConfig(id) {
      const config = configs.find((candidate) => candidate.id === id);
      if (!config) throw new NotFoundError("CONFIG_NOT_FOUND");
      const user = users.find((candidate) => candidate.id === config.userId);
      const backend = backends.find((candidate) => candidate.id === config.backendId);
      if (user && backend) {
        config.uri = buildUri(user, backend);
        config.lastGeneratedAt = now();
      }
      return delay({ ...config });
    },

    async generateConfigs({ userId, backendIds }) {
      const user = users.find((candidate) => candidate.id === userId);
      if (!user) throw new NotFoundError("USER_NOT_FOUND");

      const created: Config[] = [];
      for (const backendId of backendIds) {
        const existing = configs.find(
          (config) => config.userId === userId && config.backendId === backendId,
        );
        const backend = backends.find((candidate) => candidate.id === backendId);
        if (!backend || backend.status !== "active") continue;

        if (existing) {
          existing.uri = buildUri(user, backend);
          existing.lastGeneratedAt = now();
          created.push({ ...existing });
          continue;
        }

        const config: Config = {
          id: `c-${crypto.randomUUID().slice(0, 8)}`,
          userId,
          backendId,
          protocol: backend.protocol,
          name: `${backend.name}-${backend.protocol.toUpperCase()}`,
          uri: buildUri(user, backend),
          isActive: true,
          lastGeneratedAt: now(),
          createdAt: now(),
          updatedAt: now(),
        };
        configs = [config, ...configs];
        created.push({ ...config });
      }
      return delay(created);
    },

    async listSubscriptions({ userId } = {}) {
      let result = [...subscriptions];
      if (userId && userId !== "all") {
        result = result.filter((sub) => sub.userId === userId);
      }
      result.sort((a, b) => b.createdAt - a.createdAt);
      return delay(result);
    },

    async createSubscription({ userId, name, format }) {
      const subscription: Subscription = {
        id: `s-${crypto.randomUUID().slice(0, 8)}`,
        userId,
        token: randomToken(),
        name,
        format,
        includeInactive: false,
        expiresAt: null,
        lastAccessAt: null,
        accessCount: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      subscriptions = [subscription, ...subscriptions];
      return delay({ ...subscription });
    },

    async updateSubscription(id, body) {
      const subscription = subscriptions.find((candidate) => candidate.id === id);
      if (!subscription) throw new NotFoundError("SUBSCRIPTION_NOT_FOUND");
      Object.assign(subscription, body, { updatedAt: now() });
      return delay({ ...subscription });
    },

    async deleteSubscription(id) {
      subscriptions = subscriptions.filter((sub) => sub.id !== id);
      return delay(undefined);
    },

    async rotateSubscriptionToken(id) {
      const subscription = subscriptions.find((candidate) => candidate.id === id);
      if (!subscription) throw new NotFoundError("SUBSCRIPTION_NOT_FOUND");
      subscription.token = randomToken();
      subscription.accessCount = 0;
      subscription.lastAccessAt = null;
      subscription.updatedAt = now();
      return delay({ ...subscription });
    },

    async listAdmins() {
      return delay(admins.map((admin) => ({ ...admin })));
    },

    async createAdmin({ username, role }) {
      const clash = admins.some(
        (admin) => admin.username.toLowerCase() === username.toLowerCase(),
      );
      if (clash) throw new ConflictError("USERNAME_TAKEN");
      const admin: PanelAdmin = {
        id: `admin-${crypto.randomUUID().slice(0, 8)}`,
        username,
        role,
        isActive: true,
        lastLoginAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      admins = [...admins, admin];
      return delay({ ...admin });
    },

    async updateAdmin(id, body) {
      const admin = admins.find((candidate) => candidate.id === id);
      if (!admin) throw new NotFoundError("ADMIN_NOT_FOUND");
      if (body.role !== undefined) admin.role = body.role;
      if (body.isActive !== undefined) admin.isActive = body.isActive;
      admin.updatedAt = now();
      return delay({ ...admin });
    },

    async deleteAdmin(id) {
      const admin = admins.find((candidate) => candidate.id === id);
      if (!admin) throw new NotFoundError("ADMIN_NOT_FOUND");
      if (admin.role === "owner") {
        const remainingOwners = admins.filter(
          (candidate) => candidate.role === "owner" && candidate.id !== id,
        );
        if (remainingOwners.length === 0) {
          throw new ConflictError("LAST_OWNER");
        }
      }
      admins = admins.filter((candidate) => candidate.id !== id);
      return delay(undefined);
    },
  };
}
