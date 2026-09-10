import type {
  Backend,
  Config,
  ConfigUser,
  Paginated,
  PanelAdmin,
  StatsOverview,
  Subscription,
} from "../../types/dto";

/**
 * The API contract. The mock adapter implements this today; the real
 * HTTP client (backend phase) will implement the same signatures, so
 * pages won't change when the backend lands.
 */

export interface ApiClient {
  // stats
  getStats(): Promise<StatsOverview>;

  // users (config consumers)
  listUsers(params: {
    search?: string;
    status?: string;
    page?: number;
    perPage?: number;
  }): Promise<Paginated<ConfigUser>>;
  getUser(id: string): Promise<ConfigUser>;
  createUser(body: {
    username: string;
    note?: string;
    quotaGb?: number;
    expiryDays?: number | null;
    ipLimit?: number;
    enabled?: boolean;
  }): Promise<ConfigUser>;
  updateUser(
    id: string,
    body: {
      username?: string;
      note?: string | null;
      quotaGb?: number;
      expiryAt?: number | null;
      ipLimit?: number;
      enabled?: boolean;
    },
  ): Promise<ConfigUser>;
  deleteUser(id: string): Promise<void>;
  resetUserUuid(id: string): Promise<ConfigUser>;

  // backends
  listBackends(params?: { protocol?: string; status?: string }): Promise<Backend[]>;
  createBackend(
    body: Omit<Backend, "id" | "createdAt" | "updatedAt" | "sortOrder">,
  ): Promise<Backend>;
  updateBackend(
    id: string,
    body: Partial<Omit<Backend, "id" | "createdAt" | "updatedAt">>,
  ): Promise<Backend>;
  deleteBackend(id: string): Promise<void>;
  testBackend(id: string): Promise<{ latencyMs: number }>;

  // configs
  listConfigs(params?: {
    userId?: string;
    backendId?: string;
    protocol?: string;
    search?: string;
    page?: number;
    perPage?: number;
  }): Promise<Paginated<Config>>;
  deleteConfig(id: string): Promise<void>;
  rebuildConfig(id: string): Promise<Config>;
  generateConfigs(body: {
    userId: string;
    backendIds: string[];
  }): Promise<Config[]>;

  // subscriptions
  listSubscriptions(params?: { userId?: string }): Promise<Subscription[]>;
  createSubscription(body: {
    userId: string;
    name: string;
    format: Subscription["format"];
  }): Promise<Subscription>;
  updateSubscription(
    id: string,
    body: Partial<Pick<Subscription, "name" | "format" | "expiresAt">>,
  ): Promise<Subscription>;
  deleteSubscription(id: string): Promise<void>;
  rotateSubscriptionToken(id: string): Promise<Subscription>;

  // admins
  listAdmins(): Promise<PanelAdmin[]>;
  createAdmin(body: {
    username: string;
    password: string;
    role: PanelAdmin["role"];
  }): Promise<PanelAdmin>;
  updateAdmin(
    id: string,
    body: { role?: PanelAdmin["role"]; isActive?: boolean },
  ): Promise<PanelAdmin>;
  deleteAdmin(id: string): Promise<void>;
}
