import { describe, expect, it } from "vitest";

import { renderSubscriptionBody, type SubConfigSource } from "../src/sub/render";
import { DEFAULT_SETTINGS } from "../src/settings";

import type { Backend, Config, ConfigUser } from "../src/domain/types";

const user: ConfigUser = {
  id: "u-1",
  uuid: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  username: "alice",
  note: null,
  status: "active",
  quotaBytes: 0,
  usedBytes: 0,
  expiryAt: null,
  ipLimit: 0,
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_000,
};

const FRAGMENT_OFF = { mode: "none", packets: "tlshello", lengthMin: 100, lengthMax: 200, delayMin: 1, delayMax: 1, maxSplitMin: 0, maxSplitMax: 0 } as const;
const ECH_OFF = { enabled: false, serverName: "" } as const;

function backend(partial: Partial<Backend>): Backend {
  return {
    id: "b-1",
    name: "Worker-EU",
    protocol: "vless",
    host: "eu.example.com",
    port: 443,
    transport: "ws",
    security: "tls",
    sni: "eu.example.com",
    hostHeader: null,
    path: "/ws",
    serviceName: null,
    uuid: null,
    password: null,
    method: null,
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: null,
    allowInsecure: false,
    fragment: { ...FRAGMENT_OFF },
    ech: { ...ECH_OFF },
    status: "active",
    sortOrder: 0,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...partial,
  };
}

function config(partial: Partial<Config>): Config {
  return {
    id: "c-1",
    userId: user.id,
    backendId: "b-1",
    protocol: "vless",
    name: "Worker-EU-vless",
    uri: "vless://...",
    isActive: true,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...partial,
  };
}

function source(partial: {
  backend?: Partial<Backend>;
  network?: Partial<typeof DEFAULT_SETTINGS.network>;
}): SubConfigSource {
  return {
    config: config({}),
    backend: backend(partial.backend ?? {}),
    user,
    network: { ...DEFAULT_SETTINGS.network, ...partial.network },
  };
}

function renderSingbox(sources: SubConfigSource[]) {
  return JSON.parse(renderSubscriptionBody(sources, "singbox")) as Record<string, unknown>;
}

function renderClash(sources: SubConfigSource[]) {
  return renderSubscriptionBody(sources, "clash");
}

describe("sing-box ECH", () => {
  it("emits tls.ech when ECH is on and fragment is off", () => {
    const doc = renderSingbox([
      source({
        backend: {
          ech: { enabled: true, serverName: "ech.example.com" },
        },
      }),
    ]);
    const tls = (doc.outbounds as Record<string, unknown>[])[0].tls as Record<string, unknown>;

    expect(tls.ech).toEqual({
      enabled: true,
      query_server_name: "ech.example.com",
    });
  });

  it("drops ECH when fragment is on — fragment wins", () => {
    const doc = renderSingbox([
      source({
        backend: {
          fragment: { ...FRAGMENT_OFF, mode: "custom" },
          ech: { enabled: true, serverName: "ech.example.com" },
        },
      }),
    ]);
    const tls = (doc.outbounds as Record<string, unknown>[])[0].tls as Record<string, unknown>;

    expect(tls.ech).toBeUndefined();
    expect(tls.record_fragment).toBe(true);
  });

  it("drops ECH when security is none", () => {
    const doc = renderSingbox([
      source({
        backend: {
          security: "none",
          ech: { enabled: true, serverName: "ech.example.com" },
        },
      }),
    ]);
    const outbound = (doc.outbounds as Record<string, unknown>[])[0];

    expect(outbound.tls).toBeUndefined();
  });

  it("emits no tls at all when ECH is off and security is none", () => {
    const doc = renderSingbox([
      source({ backend: { security: "none", ech: { enabled: false, serverName: "" } } }),
    ]);
    const outbound = (doc.outbounds as Record<string, unknown>[])[0];

    expect(outbound.tls).toBeUndefined();
  });
});

describe("sing-box fragment", () => {
  it("sets record_fragment when fragment mode is custom", () => {
    const doc = renderSingbox([
      source({ backend: { fragment: { ...FRAGMENT_OFF, mode: "custom" } } }),
    ]);
    const tls = (doc.outbounds as Record<string, unknown>[])[0].tls as Record<string, unknown>;

    expect(tls.record_fragment).toBe(true);
  });

  it("omits record_fragment when fragment is off", () => {
    const doc = renderSingbox([source({})]);
    const tls = (doc.outbounds as Record<string, unknown>[])[0].tls as Record<string, unknown>;

    expect(tls.record_fragment).toBeUndefined();
  });
});

describe("sing-box DNS", () => {
  it("routes HTTPS queries for ECH server names direct, not through the tunnel", () => {
    const doc = renderSingbox([
      source({ backend: { ech: { enabled: true, serverName: "ech.example.com" } } }),
    ]);
    const dns = doc.dns as Record<string, unknown>;
    const rules = dns.rules as Record<string, unknown>[];

    expect(rules).toContainEqual({
      domain_suffix: ["ech.example.com"],
      query_type: ["HTTPS"],
      action: "route",
      server: "dns-direct",
    });
  });

  it("emits no HTTPS rule when no backend has ECH", () => {
    const doc = renderSingbox([source({})]);
    const dns = doc.dns as Record<string, unknown>;
    const rules = dns.rules as Record<string, unknown>[];

    expect(rules.filter((rule) => (rule.query_type as string[])?.includes("HTTPS"))).toEqual([]);
  });

  it("deduplicates server names across backends", () => {
    const doc = renderSingbox([
      source({ backend: { id: "b-1", ech: { enabled: true, serverName: "ech.example.com" } } }),
      source({ backend: { id: "b-2", ech: { enabled: true, serverName: "ech.example.com" } } }),
    ]);
    const dns = doc.dns as Record<string, unknown>;
    const rules = dns.rules as Record<string, unknown>[];

    expect(rules.filter((rule) => rule.server === "dns-direct")).toHaveLength(1);
  });

  it("resolves remote DNS through the proxy, direct DNS locally", () => {
    const doc = renderSingbox([source({})]);
    const dns = doc.dns as Record<string, unknown>;
    const servers = dns.servers as Record<string, unknown>[];

    // DEFAULT_SETTINGS uses https://8.8.8.8/dns-query → host + path.
    expect(servers).toContainEqual({
      type: "https",
      server: "8.8.8.8/dns-query",
      detour: "NexPanel",
      tag: "dns-remote",
    });
    expect(servers).toContainEqual({ type: "udp", server: "1.1.1.1", tag: "dns-direct" });
  });

  it("honours the configured local and remote resolvers", () => {
    const doc = renderSingbox([
      source({
        network: {
          dns: { ...DEFAULT_SETTINGS.network.dns, local: "9.9.9.9", remote: "https://dns.google/dns-query" },
        },
      }),
    ]);
    const dns = doc.dns as Record<string, unknown>;
    const servers = dns.servers as Record<string, unknown>[];

    // Only the scheme is stripped — the path is part of a DoH endpoint.
    expect(servers).toContainEqual({
      type: "https",
      server: "dns.google/dns-query",
      detour: "NexPanel",
      tag: "dns-remote",
    });
    expect(servers).toContainEqual({ type: "udp", server: "9.9.9.9", tag: "dns-direct" });
  });

  it("adds a fakeip server when fake DNS is enabled", () => {
    const doc = renderSingbox([
      source({
        network: { dns: { ...DEFAULT_SETTINGS.network.dns, fakeDns: true } },
      }),
    ]);
    const dns = doc.dns as Record<string, unknown>;
    const servers = dns.servers as Record<string, unknown>[];

    expect(servers.map((server) => server.tag)).toContain("dns-fake");
  });
});

describe("sing-box fingerprint precedence", () => {
  it("prefers the backend fingerprint over the panel default", () => {
    const doc = renderSingbox([
      source({ backend: { fingerprint: "firefox" }, network: { fingerprint: "safari" } }),
    ]);
    const tls = (doc.outbounds as Record<string, unknown>[])[0].tls as Record<string, unknown>;

    expect((tls.utls as Record<string, unknown>).fingerprint).toBe("firefox");
  });

  it("falls back to the panel default when the backend sets none", () => {
    const doc = renderSingbox([
      source({ backend: { fingerprint: null }, network: { fingerprint: "safari" } }),
    ]);
    const tls = (doc.outbounds as Record<string, unknown>[])[0].tls as Record<string, unknown>;

    expect((tls.utls as Record<string, unknown>).fingerprint).toBe("safari");
  });
});

describe("clash ECH", () => {
  it("emits ech-opts when ECH is on and fragment is off", () => {
    const yaml = renderClash([
      source({ backend: { ech: { enabled: true, serverName: "ech.example.com" } } }),
    ]);

    expect(yaml).toContain("ech-opts:");
    expect(yaml).toContain("query-server-name: \"ech.example.com\"");
  });

  it("omits ech-opts when fragment is on", () => {
    const yaml = renderClash([
      source({
        backend: {
          fragment: { ...FRAGMENT_OFF, mode: "custom" },
          ech: { enabled: true, serverName: "ech.example.com" },
        },
      }),
    ]);

    expect(yaml).not.toContain("ech-opts");
  });
});

describe("plain and base64 bodies", () => {
  it("plain joins config URIs", () => {
    const body = renderSubscriptionBody([source({})], "plain");

    expect(body).toBe("vless://...");
  });

  it("base64 wraps the plain body", () => {
    const body = renderSubscriptionBody([source({})], "base64");

    expect(body).not.toBe("vless://...");
  });
});
