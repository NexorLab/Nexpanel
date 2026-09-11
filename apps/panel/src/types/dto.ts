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

export type FragmentMode = "none" | "custom";
export type FragmentPackets = "tlshello" | "hello-ice" | "1-3";
export type TlsFingerprint =
  | "chrome"
  | "firefox"
  | "safari"
  | "ios"
  | "android"
  | "edge"
  | "random";

export interface FragmentSettings {
  mode: FragmentMode;
  packets: FragmentPackets;
  /** bytes per fragment */
  lengthMin: number;
  lengthMax: number;
  /** ms between fragments */
  delayMin: number;
  delayMax: number;
  /** 0 disables max-split (BPB parity) */
  maxSplitMin: number;
  maxSplitMax: number;
}

/** Ignored while fragment.mode is "custom" — fragment takes precedence (BPB parity). */
export interface EchSettings {
  enabled: boolean;
  serverName: string;
}

export interface CustomCdnSettings {
  addrs: string[];
  host: string;
  sni: string;
}

export interface DnsSettings {
  local: string;
  antiSanction: string;
  /** DoH endpoint; must start with https:// */
  remote: string;
  fakeDns: boolean;
}

export interface NetworkSettings {
  fragment: FragmentSettings;
  ech: EchSettings;
  tcpFastOpen: boolean;
  /** seconds; later used as the url-test interval */
  bestPingInterval: number;
  customCdn: CustomCdnSettings;
  cleanIPs: string[];
  proxyIPs: string[];
  ports: number[];
  fingerprint: TlsFingerprint;
  dns: DnsSettings;
}

export interface GeneralSettings {
  panelName: string;
  siteUrl: string;
  subscriptionBaseUrl: string;
  defaultLanguage: "en" | "fa";
  defaultQuotaGb: number;
  defaultExpiryDays: number;
}

export interface PanelSettings {
  general: GeneralSettings;
  network: NetworkSettings;
}

export interface StatsOverview {
  users: { total: number; active: number; disabled: number; expired: number };
  backends: { total: number; active: number };
  configs: { total: number; byProtocol: Record<Protocol, number> };
  subscriptions: { total: number; active: number };
  series: { configsPerDay: { date: string; count: number }[] };
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
