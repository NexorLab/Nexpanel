/**
 * Domain types shared with the future backend (@nexpanel/core).
 * These mirror the planned D1 schema — see docs/database.md (phase 7).
 */

export type Protocol = "vless" | "vmess" | "trojan" | "shadowsocks";
export type Transport = "tcp" | "ws" | "grpc" | "httpupgrade" | "xhttp";
export type Security = "none" | "tls" | "reality";
export type UserStatus = "active" | "disabled" | "expired" | "limited";
export type BackendStatus = "active" | "disabled";
export type SubscriptionFormat = "base64" | "plain" | "clash" | "singbox";
export type AdminRole = "owner" | "admin" | "viewer";

export interface ConfigUser {
  id: string;
  uuid: string;
  username: string;
  note: string | null;
  status: UserStatus;
  /** 0 = unlimited */
  quotaBytes: number;
  usedBytes: number;
  /** unix seconds; null = never expires */
  expiryAt: number | null;
  /** 0 = unlimited */
  ipLimit: number;
  createdAt: number;
  updatedAt: number;
}

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
  status: BackendStatus;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Config {
  id: string;
  userId: string;
  backendId: string;
  protocol: Protocol;
  name: string;
  uri: string;
  isActive: boolean;
  lastGeneratedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface Subscription {
  id: string;
  userId: string;
  token: string;
  name: string;
  format: SubscriptionFormat;
  includeInactive: boolean;
  expiresAt: number | null;
  lastAccessAt: number | null;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PanelAdmin {
  id: string;
  username: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// Settings types are the shared domain — single source of truth in core
// so the panel and the API can never drift.
import type {
  CustomCdnSettings,
  DnsSettings,
  EchSettings,
  FragmentMode,
  FragmentPackets,
  FragmentSettings,
  GeneralSettings,
  NetworkSettings,
  PanelSettings,
  StatsOverviewBase,
  TlsFingerprint,
} from "@nexpanel/core";

export type {
  CustomCdnSettings,
  DnsSettings,
  EchSettings,
  FragmentMode,
  FragmentPackets,
  FragmentSettings,
  GeneralSettings,
  NetworkSettings,
  PanelSettings,
  StatsOverviewBase,
  TlsFingerprint,
};

export interface AuthStatus {
  needsSetup: boolean;
}

export interface LoginResult {
  token: string;
  admin: { id: string; username: string; role: AdminRole };
}

// StatsOverview is the shared domain — single source of truth in core;
// the API composes `activity` on top of it.
export interface StatsOverview extends StatsOverviewBase {
  activity: { id: string; messageKey: string; params: Record<string, string>; at: number }[];
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number };
}

export interface ApiError {
  code:
    | "VALIDATION_ERROR"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "QUOTA_EXCEEDED"
    | "LIMIT_REACHED"
    | "INTERNAL";
  message: string;
}
