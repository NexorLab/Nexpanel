import type {
  Backend,
  Config,
  ConfigUser,
  PanelAdmin,
  StatsOverview,
  Subscription,
} from "../../../types/dto";

function unixDaysAgo(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 86400;
}

function unixDaysAhead(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86400;
}

export const seedUsers: ConfigUser[] = [
  {
    id: "u-1",
    uuid: "b831381d-6324-4d53-ad4f-8cda48b30811",
    username: "alice",
    note: "Personal laptop + phone",
    status: "active",
    quotaBytes: 50 * 1024 ** 3,
    usedBytes: 21.4 * 1024 ** 3,
    expiryAt: unixDaysAhead(23),
    ipLimit: 3,
    createdAt: unixDaysAgo(40),
    updatedAt: unixDaysAgo(2),
  },
  {
    id: "u-2",
    uuid: "c2b4a1f0-9e8d-4c7a-b6f5-a1d2e3f4a5b6",
    username: "bob",
    note: null,
    status: "active",
    quotaBytes: 100 * 1024 ** 3,
    usedBytes: 87.9 * 1024 ** 3,
    expiryAt: unixDaysAhead(4),
    ipLimit: 2,
    createdAt: unixDaysAgo(65),
    updatedAt: unixDaysAgo(1),
  },
  {
    id: "u-3",
    uuid: "d3c5b2e1-8d7c-4b6a-9e8f-b2c3d4e5f6a7",
    username: "sara",
    note: "Family plan",
    status: "active",
    quotaBytes: 0,
    usedBytes: 12.1 * 1024 ** 3,
    expiryAt: null,
    ipLimit: 0,
    createdAt: unixDaysAgo(90),
    updatedAt: unixDaysAgo(6),
  },
  {
    id: "u-4",
    uuid: "e4d6c3f2-7c6b-4a5d-8f9e-c3d4e5f6a7b8",
    username: "reza_dev",
    note: "Testing new clients",
    status: "disabled",
    quotaBytes: 20 * 1024 ** 3,
    usedBytes: 3.2 * 1024 ** 3,
    expiryAt: unixDaysAhead(60),
    ipLimit: 1,
    createdAt: unixDaysAgo(30),
    updatedAt: unixDaysAgo(9),
  },
  {
    id: "u-5",
    uuid: "f5e7d4a3-6b5a-494e-9f8a-d4e5f6a7b8c9",
    username: "mike",
    note: null,
    status: "expired",
    quotaBytes: 30 * 1024 ** 3,
    usedBytes: 29.7 * 1024 ** 3,
    expiryAt: unixDaysAgo(5),
    ipLimit: 2,
    createdAt: unixDaysAgo(120),
    updatedAt: unixDaysAgo(5),
  },
  {
    id: "u-6",
    uuid: "a6f8e5b4-5a49-483f-8a9b-e5f6a7b8c9d0",
    username: "nadia",
    note: "Mobile only",
    status: "active",
    quotaBytes: 10 * 1024 ** 3,
    usedBytes: 8.9 * 1024 ** 3,
    expiryAt: unixDaysAhead(90),
    ipLimit: 1,
    createdAt: unixDaysAgo(12),
    updatedAt: unixDaysAgo(3),
  },
  {
    id: "u-7",
    uuid: "b7a9f6c5-4938-472e-9bac-f6a7b8c9d0e1",
    username: "limited_user",
    note: "Hit quota cap",
    status: "limited",
    quotaBytes: 5 * 1024 ** 3,
    usedBytes: 5 * 1024 ** 3,
    expiryAt: unixDaysAhead(15),
    ipLimit: 1,
    createdAt: unixDaysAgo(20),
    updatedAt: unixDaysAgo(4),
  },
  {
    id: "u-8",
    uuid: "c8b0a7d6-3827-461d-8cbd-a7b8c9d0e1f2",
    username: "old_account",
    note: "Unused since March",
    status: "disabled",
    quotaBytes: 0,
    usedBytes: 0,
    expiryAt: null,
    ipLimit: 0,
    createdAt: unixDaysAgo(200),
    updatedAt: unixDaysAgo(150),
  },
];

export const seedBackends: Backend[] = [
  {
    id: "b-1",
    name: "CF-Worker-EU",
    protocol: "vless",
    host: "eu.nexpanel.example",
    port: 443,
    transport: "ws",
    security: "tls",
    sni: "eu.nexpanel.example",
    hostHeader: "eu.nexpanel.example",
    path: "/vless",
    serviceName: null,
    uuid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    password: null,
    method: null,
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: "chrome",
    allowInsecure: false,
    status: "active",
    sortOrder: 1,
    createdAt: unixDaysAgo(100),
    updatedAt: unixDaysAgo(10),
  },
  {
    id: "b-2",
    name: "CF-Worker-US",
    protocol: "vless",
    host: "us.nexpanel.example",
    port: 443,
    transport: "ws",
    security: "tls",
    sni: "us.nexpanel.example",
    hostHeader: "us.nexpanel.example",
    path: "/vless",
    serviceName: null,
    uuid: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    password: null,
    method: null,
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: "chrome",
    allowInsecure: false,
    status: "active",
    sortOrder: 2,
    createdAt: unixDaysAgo(100),
    updatedAt: unixDaysAgo(10),
  },
  {
    id: "b-3",
    name: "DE-Frankfurt-VMess",
    protocol: "vmess",
    host: "de1.nexpanel.example",
    port: 2053,
    transport: "ws",
    security: "tls",
    sni: "de1.nexpanel.example",
    hostHeader: "de1.nexpanel.example",
    path: "/vmess",
    serviceName: null,
    uuid: "c3d4e5f6-a7b8-9012-cdef-123456789012",
    password: null,
    method: null,
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: "chrome",
    allowInsecure: false,
    status: "active",
    sortOrder: 3,
    createdAt: unixDaysAgo(80),
    updatedAt: unixDaysAgo(20),
  },
  {
    id: "b-4",
    name: "SG-Trojan",
    protocol: "trojan",
    host: "sg1.nexpanel.example",
    port: 443,
    transport: "tcp",
    security: "tls",
    sni: "sg1.nexpanel.example",
    hostHeader: null,
    path: null,
    serviceName: null,
    uuid: null,
    password: "trojan-pass-9876",
    method: null,
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: "chrome",
    allowInsecure: false,
    status: "active",
    sortOrder: 4,
    createdAt: unixDaysAgo(60),
    updatedAt: unixDaysAgo(30),
  },
  {
    id: "b-5",
    name: "NL-Shadowsocks",
    protocol: "shadowsocks",
    host: "nl1.nexpanel.example",
    port: 8388,
    transport: "tcp",
    security: "none",
    sni: null,
    hostHeader: null,
    path: null,
    serviceName: null,
    uuid: null,
    password: "ss-pass-5432",
    method: "aes-256-gcm",
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: null,
    allowInsecure: false,
    status: "disabled",
    sortOrder: 5,
    createdAt: unixDaysAgo(50),
    updatedAt: unixDaysAgo(7),
  },
];

const PROTOCOL_OF: Record<string, Backend["protocol"]> = Object.fromEntries(
  seedBackends.map((backend) => [backend.id, backend.protocol]),
);

export function buildSeedConfigs(users: ConfigUser[]): Config[] {
  const configs: Config[] = [];
  let counter = 1;

  for (const user of users) {
    if (user.status === "disabled") continue;

    const activeBackends = seedBackends.filter((backend) => backend.status === "active");
    // Give each active user 2–4 configs
    const count = 2 + (counter % 3);
    for (let i = 0; i < count && i < activeBackends.length; i++) {
      const backend = activeBackends[(counter + i) % activeBackends.length];
      const protocol = PROTOCOL_OF[backend.id];
      configs.push({
        id: `c-${counter}-${i}`,
        userId: user.id,
        backendId: backend.id,
        protocol,
        name: `${backend.name}-${protocol.toUpperCase()}`,
        uri: `${protocol}://${user.uuid}@${backend.host}:${backend.port}?type=${backend.transport}&security=${backend.security}#NexPanel-${backend.name}`,
        isActive: true,
        lastGeneratedAt: unixDaysAgo(i + 1),
        createdAt: unixDaysAgo(i + 1),
        updatedAt: unixDaysAgo(i + 1),
      });
    }
    counter++;
  }

  return configs;
}

export const seedSubscriptions: Omit<Subscription, "userId">[] = [
  {
    id: "s-1",
    token: "9f2c4e6a8b0d1f3a5c7e9b1d3f5a7c9e",
    name: "default",
    format: "base64",
    includeInactive: false,
    expiresAt: null,
    lastAccessAt: unixDaysAgo(0),
    accessCount: 142,
    createdAt: unixDaysAgo(35),
    updatedAt: unixDaysAgo(35),
  },
  {
    id: "s-2",
    token: "1a3b5d7f9e2c4a6b8d0f2a4c6e8b0d2f",
    name: "default",
    format: "clash",
    includeInactive: false,
    expiresAt: unixDaysAhead(200),
    lastAccessAt: unixDaysAgo(1),
    accessCount: 57,
    createdAt: unixDaysAgo(28),
    updatedAt: unixDaysAgo(28),
  },
  {
    id: "s-3",
    token: "2b4c6e8f0a1d3b5c7e9f1a3b5d7f9e0a",
    name: "default",
    format: "base64",
    includeInactive: false,
    expiresAt: null,
    lastAccessAt: unixDaysAgo(3),
    accessCount: 312,
    createdAt: unixDaysAgo(80),
    updatedAt: unixDaysAgo(80),
  },
  {
    id: "s-4",
    token: "3c5d7f0a1b2e4c6d8f0a2b4c6e8f0a1b",
    name: "mobile",
    format: "singbox",
    includeInactive: false,
    expiresAt: null,
    lastAccessAt: unixDaysAgo(10),
    accessCount: 23,
    createdAt: unixDaysAgo(15),
    updatedAt: unixDaysAgo(15),
  },
  {
    id: "s-5",
    token: "4d6e8f0a1b2c3d5e7f9a0b1c2d3e4f5a",
    name: "default",
    format: "plain",
    includeInactive: true,
    expiresAt: null,
    lastAccessAt: null,
    accessCount: 0,
    createdAt: unixDaysAgo(2),
    updatedAt: unixDaysAgo(2),
  },
];

export const seedAdmins: PanelAdmin[] = [
  {
    id: "admin-1",
    username: "admin",
    role: "owner",
    isActive: true,
    lastLoginAt: unixDaysAgo(0),
    createdAt: unixDaysAgo(120),
    updatedAt: unixDaysAgo(0),
  },
  {
    id: "admin-2",
    username: "operator",
    role: "admin",
    isActive: true,
    lastLoginAt: unixDaysAgo(1),
    createdAt: unixDaysAgo(60),
    updatedAt: unixDaysAgo(60),
  },
  {
    id: "viewer-1",
    username: "auditor",
    role: "viewer",
    isActive: true,
    lastLoginAt: unixDaysAgo(5),
    createdAt: unixDaysAgo(30),
    updatedAt: unixDaysAgo(30),
  },
  {
    id: "admin-3",
    username: "inactive_admin",
    role: "admin",
    isActive: false,
    lastLoginAt: unixDaysAgo(45),
    createdAt: unixDaysAgo(90),
    updatedAt: unixDaysAgo(45),
  },
];

export function buildSeedStats(
  users: ConfigUser[],
  backends: Backend[],
  configs: Config[],
  subscriptions: Subscription[],
) {
  const byProtocol: Record<Config["protocol"], number> = {
    vless: 0,
    vmess: 0,
    trojan: 0,
    shadowsocks: 0,
  };
  for (const config of configs) {
    byProtocol[config.protocol]++;
  }

  const configsPerDay = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400_000);
    return {
      date: date.toISOString().slice(0, 10),
      count: 4 + ((index * 7 + 5) % 11),
    };
  });

  return {
    users: {
      total: users.length,
      active: users.filter((user) => user.status === "active").length,
      disabled: users.filter((user) => user.status === "disabled").length,
      expired: users.filter((user) => user.status === "expired").length,
    },
    backends: {
      total: backends.length,
      active: backends.filter((backend) => backend.status === "active").length,
    },
    configs: { total: configs.length, byProtocol },
    subscriptions: {
      total: subscriptions.length,
      active: subscriptions.filter((sub) => !sub.expiresAt || sub.expiresAt > Math.floor(Date.now() / 1000)).length,
    },
    series: { configsPerDay },
    activity: [
      { id: "a-1", messageKey: "activity.userCreated", params: { name: "nadia" } as Record<string, string>, at: unixDaysAgo(0) },
      { id: "a-2", messageKey: "activity.configsGenerated", params: { count: "3", user: "alice" } as Record<string, string>, at: unixDaysAgo(1) },
      { id: "a-3", messageKey: "activity.backendUpdated", params: { name: "NL-Shadowsocks" } as Record<string, string>, at: unixDaysAgo(2) },
      { id: "a-4", messageKey: "activity.subRotated", params: { name: "mobile" } as Record<string, string>, at: unixDaysAgo(3) },
      { id: "a-5", messageKey: "activity.userDisabled", params: { name: "reza_dev" } as Record<string, string>, at: unixDaysAgo(4) },
    ] satisfies StatsOverview["activity"],
  };
}
