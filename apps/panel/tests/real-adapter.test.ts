/**
 * Contract test for the real HTTP adapter (src/lib/api/real).
 *
 * Stubs global fetch and pins the wire shape the panel sends to the
 * Workers API (docs/api.md):
 *  - the /api/v1 prefix, and the Bearer token on private routes only,
 *  - the 401 → clear-stored-auth handoff that routes back to /login,
 *  - GB→bytes and days→unix translation the mock contract hides,
 *  - re-derivation of `expired`, a UI state the server never stores,
 *  - Paginated<T> results and empty-body handling,
 *  - the UI-only "all" filter sentinel never leaking onto the wire.
 *
 * No jsdom/msw: the adapter only touches globalThis.fetch and
 * localStorage, both stubbed here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, createHttpAdapter } from "../src/lib/api/real/adapter";
import type { ConfigUser } from "../src/types/dto";

// Pinned as literals on purpose: these are the keys AuthContext writes, and
// the adapter must keep reading/clearing exactly them. Re-exporting the
// adapter's own constant would make the test agree with itself instead of
// pinning the handshake between the two modules.
const TOKEN_KEY = "nexpanel.token";
const ADMIN_KEY = "nexpanel.admin";

type Call = { url: string; init: RequestInit };

let calls: Call[] = [];
let jsonReads = 0;
let storage: Map<string, string>;

/** A canned response: `status` plus a body that is only parsed on read. */
function respond(status: number, body?: unknown): { status: number; bodyText: string } {
  return { status, bodyText: body === undefined ? "" : JSON.stringify(body) };
}

let responder: (call: Call) => { status: number; bodyText: string };

/** Routes the stub's replies. Replaces any earlier responder. */
function stubFetch(
  next: (call: Call) => { status: number; bodyText: string } = () => respond(200),
): void {
  responder = next;
}

beforeEach(() => {
  calls = [];
  jsonReads = 0;
  responder = () => respond(200);
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  });
  vi.stubGlobal(
    "fetch",
    async (url: string, init: RequestInit): Promise<Response> => {
      const out = responder({ url, init });
      calls.push({ url, init });
      return {
        ok: out.status >= 200 && out.status < 300,
        status: out.status,
        async json() {
          jsonReads += 1;
          return JSON.parse(out.bodyText);
        },
      } as Response;
    },
  );
});

const call = (index = 0): Call => calls[index];
const headers = (index = 0): Record<string, string> =>
  call(index).init.headers as Record<string, string>;
const sentBody = (index = 0): Record<string, unknown> =>
  JSON.parse(String(call(index).init.body)) as Record<string, unknown>;

/** A user record as the D1 layer would return one. */
function user(over: Partial<ConfigUser> = {}): ConfigUser {
  return {
    id: "u1",
    uuid: "uuid-1",
    username: "user",
    note: null,
    status: "active",
    quotaBytes: 0,
    usedBytes: 0,
    expiryAt: null,
    ipLimit: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

const PAGE = { data: [] as ConfigUser[], meta: { page: 1, perPage: 20, total: 0 } };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("real http adapter", () => {
  const api = createHttpAdapter();

  describe("routing and the auth header", () => {
    it("prefixes every route with /api/v1", async () => {
      // The list route carries a query string; the single-record routes don't.
      stubFetch((req) =>
        req.url.includes("/users") && !req.url.includes("/users/") ? respond(200, PAGE) : respond(200, user()),
      );
      await api.listUsers({ page: 1, perPage: 20 });
      await api.getUser("u1");
      await api.resetUserUuid("u1");

      expect(calls.map((c) => c.url)).toEqual([
        "/api/v1/users?page=1&perPage=20",
        "/api/v1/users/u1",
        "/api/v1/users/u1/reset-uuid",
      ]);
    });

    it("attaches the Bearer token to private routes only", async () => {
      storage.set(TOKEN_KEY, "jwt-1");
      stubFetch(() => respond(200, { needsSetup: false }));

      // Public: /auth/status, /auth/login, /auth/setup carry no token.
      await api.getAuthStatus();
      await api.login({ username: "admin", password: "x" });
      expect(headers(0)).not.toHaveProperty("authorization");
      expect(headers(1)).not.toHaveProperty("authorization");

      // Private: everything else does.
      await api.getStats();
      expect(headers(2).authorization).toBe("Bearer jwt-1");
    });

    it("sends JSON with a content-type header on writes", async () => {
      stubFetch(() => respond(200, user()));
      await api.createUser({ username: "u" });
      expect(headers(0)["content-type"]).toBe("application/json");
      expect(typeof call(0).init.body).toBe("string");
    });
  });

  describe("error handling", () => {
    it("clears stored auth on a 401 from a private route", async () => {
      storage.set(TOKEN_KEY, "jwt-1");
      storage.set(ADMIN_KEY, "admin");
      stubFetch(() => respond(401, { error: { code: "UNAUTHORIZED", message: "bad token" } }));

      await expect(api.getStats()).rejects.toMatchObject({
        name: "ApiError",
        code: "UNAUTHORIZED",
        status: 401,
        message: "bad token",
      });
      expect(storage.has(TOKEN_KEY)).toBe(false);
      expect(storage.has(ADMIN_KEY)).toBe(false);
    });

    it("keeps stored auth on a 401 from a public route", async () => {
      // A wrong password at /login must not log a signed-in user out —
      // RequireAuth would then bounce them off the page they were on.
      storage.set(TOKEN_KEY, "jwt-1");
      stubFetch(() => respond(401, { error: { code: "UNAUTHORIZED", message: "wrong" } }));

      await expect(api.login({ username: "a", password: "b" })).rejects.toBeInstanceOf(ApiError);
      expect(storage.get(TOKEN_KEY)).toBe("jwt-1");
    });

    it("maps the server error envelope onto ApiError", async () => {
      stubFetch(() => respond(409, { error: { code: "CONFLICT", message: "exists" } }));
      await expect(api.createAdmin({ username: "a", password: "b", role: "admin" })).rejects.toMatchObject({
        code: "CONFLICT",
        message: "exists",
        status: 409,
      });
    });

    it("falls back to INTERNAL when the body is not the error envelope", async () => {
      stubFetch(() => respond(500, "plain text"));
      await expect(api.getSettings()).rejects.toMatchObject({ code: "INTERNAL", status: 500 });
    });

    it("reports UNAVAILABLE when fetch throws", async () => {
      stubFetch(() => {
        throw new Error("network down");
      });
      await expect(api.getStats()).rejects.toMatchObject({ code: "UNAVAILABLE", status: 0 });
    });
  });

  describe("user translation (mock contract → wire contract)", () => {
    it("converts quota GB→bytes and expiry days→unix seconds on create", async () => {
      stubFetch(() => respond(200, user()));
      const start = Math.floor(Date.now() / 1000);
      await api.createUser({ username: "u", quotaGb: 10, expiryDays: 30, ipLimit: 3 });

      const body = sentBody();
      expect(body).toEqual({
        username: "u",
        note: null,
        quotaBytes: 10 * 1024 ** 3,
        expiryAt: expect.any(Number),
        ipLimit: 3,
        status: "active",
      });
      expect(body.expiryAt as number).toBeGreaterThanOrEqual(start + 30 * 86400);
      expect(body.expiryAt as number).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 30 * 86400 + 2);
    });

    it("treats no expiry as null and enabled=false as disabled", async () => {
      stubFetch(() => respond(200, user()));
      await api.createUser({ username: "u", expiryDays: null, enabled: false });
      expect(sentBody()).toEqual({
        username: "u",
        note: null,
        quotaBytes: 0,
        expiryAt: null,
        ipLimit: 0,
        status: "disabled",
      });
    });

    it("converts quota on update and passes expiryAt through unchanged", async () => {
      stubFetch(() => respond(200, user()));
      await api.updateUser("u1", { quotaGb: 5, expiryAt: 1700000000, enabled: false });

      const body = sentBody();
      expect(body.quotaBytes).toBe(5 * 1024 ** 3);
      expect(body.expiryAt).toBe(1700000000);
      expect(body.status).toBe("disabled");
    });

    it("omits unset patch fields so the update stays partial", async () => {
      stubFetch(() => respond(200, user()));
      await api.updateUser("u1", { username: "renamed" });
      expect(Object.keys(sentBody())).toEqual(["username"]);
    });
  });

  describe("expired re-derivation", () => {
    it("turns active-but-past-expiry into expired, and never overrides disabled", async () => {
      const now = Math.floor(Date.now() / 1000);
      stubFetch(() =>
        respond(200, {
          data: [
            user({ id: "a", status: "active", expiryAt: now + 600 }),
            user({ id: "b", status: "active", expiryAt: now - 600 }),
            user({ id: "c", status: "disabled", expiryAt: now - 600 }),
          ],
          meta: { page: 1, perPage: 20, total: 3 },
        }),
      );

      const result = await api.listUsers({ page: 1, perPage: 20 });
      expect(result.data.map((u) => `${u.id}:${u.status}`)).toEqual([
        "a:active",
        "b:expired",
        "c:disabled",
      ]);
    });

    it("applies the same derivation to single-user reads and writes", async () => {
      const now = Math.floor(Date.now() / 1000);
      stubFetch(() => respond(200, user({ status: "active", expiryAt: now - 60 })));

      const got = await api.getUser("u1");
      expect(got.status).toBe("expired");

      const created = await api.createUser({ username: "u", expiryDays: null });
      expect(created.status).toBe("expired");
    });
  });

  describe("pagination and empty bodies", () => {
    it("returns Paginated<T> for listUsers and listConfigs, not bare arrays", async () => {
      stubFetch(() => respond(200, { data: [user()], meta: { page: 2, perPage: 10, total: 1 } }));
      const users = await api.listUsers({ page: 2, perPage: 10 });
      expect(users.meta).toEqual({ page: 2, perPage: 10, total: 1 });
      expect(users.data).toHaveLength(1);

      stubFetch(() =>
        respond(200, {
          data: [{ id: "c1", userId: "u1", backendId: "b1", protocol: "vless", name: "n", uri: "vless://", isActive: true, lastGeneratedAt: 0, createdAt: 0, updatedAt: 0 }],
          meta: { page: 1, perPage: 20, total: 1 },
        }),
      );
      const configs = await api.listConfigs();
      expect(configs.meta.total).toBe(1);
    });

    it("does not read a JSON body for empty responses", async () => {
      stubFetch(() => respond(204));
      await api.logout();
      await api.deleteUser("u1");
      expect(jsonReads).toBe(0);
    });
  });

  describe("the UI-only 'all' filter sentinel", () => {
    it("is never serialized onto the wire", async () => {
      stubFetch((req) =>
        req.url.includes("/users") || req.url.includes("/configs") ? respond(200, PAGE) : respond(200, []),
      );
      await api.listUsers({ status: "all" });
      await api.listConfigs({ userId: "all", backendId: "all", protocol: "all" });
      await api.listBackends({ protocol: "all", status: "all" });
      await api.listSubscriptions({ userId: "all" });

      for (const c of calls) {
        expect(c.url).not.toMatch(/[?&](status|protocol|userId|backendId)=all/);
      }
      expect(calls.map((c) => c.url)).toEqual([
        "/api/v1/users",
        "/api/v1/configs",
        "/api/v1/backends",
        "/api/v1/subscriptions",
      ]);
    });

    it("still forwards real filter values", async () => {
      stubFetch((req) => (req.url.includes("/users") ? respond(200, PAGE) : respond(200, [])));
      await api.listUsers({ search: "ali", status: "active", page: 2, perPage: 5 });
      expect(call(0).url).toContain("search=ali");
      expect(call(0).url).toContain("status=active");
      expect(call(0).url).toContain("page=2");
      expect(call(0).url).toContain("perPage=5");

      await api.listBackends({ protocol: "vless", status: "active" });
      expect(call(1).url).toContain("protocol=vless");
      expect(call(1).url).toContain("status=active");
    });
  });

  describe("adapter selection", () => {
    it("getApi() builds the http adapter when VITE_API_MODE=real", async () => {
      vi.resetModules();
      vi.stubEnv("VITE_API_MODE", "real");
      const stats = { users: { total: 1, active: 1, disabled: 0, expired: 0, limited: 0 } };
      stubFetch(() => respond(200, stats));

      const { getApi } = await import("../src/lib/api/index");
      expect(await getApi().getStats()).toEqual(stats);
      expect(call(0).url).toBe("/api/v1/stats/overview");
    });
  });
});
