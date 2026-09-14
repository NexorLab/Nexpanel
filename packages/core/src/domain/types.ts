import type { AdminRole, Protocol, Security, Transport } from "../index";

/** Config-consumer account (a person/device that uses a proxy config). */
export interface ConfigUser {
  id: string;
  uuid: string;
  username: string;
  note: string | null;
  status: "active" | "disabled";
  /** 0 = unlimited. */
  quotaBytes: number;
  usedBytes: number;
  /** Unix seconds; null = never expires. */
  expiryAt: number | null;
  /** 0 = unlimited. */
  ipLimit: number;
  createdAt: number;
  updatedAt: number;
}

/** Upstream proxy server. */
export interface Backend {
  id: string;
  name: string;
  protocol: Protocol;
  host: string;
  port: number;
  transport: Transport;
  security: Security;
  sni: string | null;
  hostHeader: string | null;
  path: string | null;
  serviceName: string | null;
  uuid: string | null;
  password: string | null;
  method: string | null;
  realityPublicKey: string | null;
  realityShortId: string | null;
  fingerprint: string | null;
  allowInsecure: boolean;
  status: "active" | "disabled";
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** A generated proxy URI for one user on one backend. */
export interface Config {
  id: string;
  userId: string;
  backendId: string;
  protocol: Protocol;
  name: string;
  uri: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Shareable subscription link. */
export interface Subscription {
  id: string;
  userId: string;
  token: string;
  name: string;
  format: "base64" | "plain" | "clash" | "singbox";
  includeInactive: boolean;
  expiresAt: number | null;
  lastAccessAt: number | null;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Panel administrator. */
export interface PanelAdmin {
  id: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Envelope for paginated list endpoints. */
export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Dashboard feed entry. The API stores semantic events; the client
 * renders them translated (messageKey is an i18n key).
 */
export interface ActivityEvent {
  id: string;
  /** i18n key, e.g. "dashboard.activity.userCreated". */
  messageKey: string;
  /** Interpolation params for the message (JSON-encoded at rest). */
  params: Record<string, string | number>;
  /** Unix seconds. */
  at: number;
}
