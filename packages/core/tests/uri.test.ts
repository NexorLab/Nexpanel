import { describe, expect, it } from "vitest";

import { buildShadowsocksUri, buildTrojanUri, buildVlessUri, buildVmessUri } from "../src/protocols/uri";
import { verifyPassword, hashPassword } from "../src/crypto/passwords";
import { signJwt, verifyJwt } from "../src/crypto/jwt";

import type { Backend, ConfigUser } from "../src/domain/types";

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
    fingerprint: "chrome",
    allowInsecure: false,
    status: "active",
    sortOrder: 0,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...partial,
  };
}

describe("buildVlessUri", () => {
  it("encodes transport, security, sni, path and fingerprint", () => {
    const uri = buildVlessUri(user, backend({ protocol: "vless" }));
    expect(uri).toContain("vless://a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d@eu.example.com:443?");
    expect(uri).toContain("type=ws");
    expect(uri).toContain("security=tls");
    expect(uri).toContain("sni=eu.example.com");
    expect(uri).toContain("path=%2Fws");
    expect(uri).toContain("fp=chrome");
    expect(uri.endsWith("#Worker-EU-vless")).toBe(true);
  });

  it("adds REALITY params when security is reality", () => {
    const uri = buildVlessUri(
      user,
      backend({
        security: "reality",
        realityPublicKey: "pbk-key",
        realityShortId: "sid-01",
      }),
    );
    expect(uri).toContain("pbk=pbk-key");
    expect(uri).toContain("sid=sid-01");
  });
});

describe("buildVmessUri", () => {
  it("base64-encodes the v2 JSON payload", () => {
    const uri = buildVmessUri(user, backend({ protocol: "vmess" }));
    expect(uri.startsWith("vmess://")).toBe(true);
    const json = JSON.parse(atob(uri.slice("vmess://".length)));
    expect(json).toMatchObject({
      v: "2",
      add: "eu.example.com",
      port: "443",
      id: user.uuid,
      net: "ws",
      tls: "tls",
    });
  });
});

describe("buildTrojanUri", () => {
  it("uses the user uuid as password and includes security", () => {
    const uri = buildTrojanUri(user, backend({ protocol: "trojan" }));
    expect(uri).toContain(`trojan://${user.uuid}@eu.example.com:443`);
    expect(uri).toContain("security=tls");
  });
});

describe("buildShadowsocksUri", () => {
  it("is SIP002-shaped with url-safe base64 userinfo", () => {
    const uri = buildShadowsocksUri(user, backend({ protocol: "shadowsocks", method: "aes-256-gcm" }));
    expect(uri.startsWith("ss://")).toBe(true);
    const userinfo = uri.slice("ss://".length, uri.indexOf("@"));
    expect(userinfo).not.toContain("+");
    expect(userinfo).not.toContain("/");
    expect(userinfo).not.toContain("=");
    expect(uri).toContain("@eu.example.com:443");
  });
});

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("produces unique salts", async () => {
    const [a, b] = await Promise.all([hashPassword("x"), hashPassword("x")]);
    expect(a).not.toBe(b);
  });
});

describe("jwt", () => {
  it("signs and verifies claims", async () => {
    const token = await signJwt({ sub: "admin-1", role: "owner" }, "secret");
    const claims = await verifyJwt(token, "secret");
    expect(claims?.sub).toBe("admin-1");
    expect(claims?.role).toBe("owner");
  });

  it("rejects wrong secrets and malformed tokens", async () => {
    const token = await signJwt({ sub: "admin-1", role: "admin" }, "secret");
    expect(await verifyJwt(token, "other")).toBeNull();
    expect(await verifyJwt("not.a.jwt", "secret")).toBeNull();
  });
});
