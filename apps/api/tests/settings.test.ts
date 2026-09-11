import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Env } from "../src/env";
import { createFakeD1 } from "./fake-d1";
import { bearer, setupOwner } from "./helpers";
import { DEFAULT_SETTINGS } from "@nexpanel/core";

let app: ReturnType<typeof createApp>;
let env: { DB: Env["DB"]; JWT_SECRET: string };

beforeEach(() => {
  app = createApp();
  env = { DB: createFakeD1() as unknown as Env["DB"], JWT_SECRET: "test-secret-for-jwt-signing" };
});

function json(method: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}

describe("settings", () => {
  it("GET on an empty DB returns the DEFAULT_SETTINGS shape", async () => {
    const { token } = await setupOwner(app, env);
    const response = await app.request("/api/v1/settings", { headers: bearer(token) }, env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { general: unknown; network: unknown };
    expect(body).toEqual(DEFAULT_SETTINGS);
  });

  it("PATCH persists a valid network section (second GET reflects it)", async () => {
    const { token } = await setupOwner(app, env);
    const patch = await json(
      "PATCH",
      "/api/v1/settings",
      { network: { tcpFastOpen: true, ports: [443, 8443] } },
      bearer(token),
    );
    expect(patch.status).toBe(200);
    const saved = (await patch.json()) as { network: { tcpFastOpen: boolean; ports: number[] } };
    expect(saved.network.tcpFastOpen).toBe(true);
    expect(saved.network.ports).toEqual([443, 8443]);

    const second = await app.request("/api/v1/settings", { headers: bearer(token) }, env);
    const reread = (await second.json()) as { network: { tcpFastOpen: boolean } };
    expect(reread.network.tcpFastOpen).toBe(true);
  });

  it("PATCH of network leaves general untouched", async () => {
    const { token } = await setupOwner(app, env);
    await json(
      "PATCH",
      "/api/v1/settings",
      { general: { panelName: "MyPanel" } },
      bearer(token),
    );
    await json("PATCH", "/api/v1/settings", { network: { ports: [443] } }, bearer(token));

    const response = await app.request("/api/v1/settings", { headers: bearer(token) }, env);
    const body = (await response.json()) as {
      general: { panelName: string };
      network: { ports: number[] };
    };
    expect(body.general.panelName).toBe("MyPanel");
    expect(body.network.ports).toEqual([443]);
  });

  it("409 FRAGMENT_ECH_CONFLICT when fragment custom + ech enabled", async () => {
    const { token } = await setupOwner(app, env);
    const response = await json(
      "PATCH",
      "/api/v1/settings",
      {
        network: {
          fragment: { mode: "custom" },
          ech: { enabled: true },
        },
      },
      bearer(token),
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "FRAGMENT_ECH_CONFLICT",
    );
  });

  it("400 INVALID_PORTS for out-of-range ports", async () => {
    const { token } = await setupOwner(app, env);
    const response = await json(
      "PATCH",
      "/api/v1/settings",
      { network: { ports: [70000] } },
      bearer(token),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "INVALID_PORTS",
    );
  });

  it("400 INVALID_DOH_URL for a non-https remote DNS", async () => {
    const { token } = await setupOwner(app, env);
    const response = await json(
      "PATCH",
      "/api/v1/settings",
      { network: { dns: { remote: "http://8.8.8.8/dns-query" } } },
      bearer(token),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "INVALID_DOH_URL",
    );
  });

  it("400 VALIDATION_ERROR for an invalid panel name", async () => {
    const { token } = await setupOwner(app, env);
    const response = await json(
      "PATCH",
      "/api/v1/settings",
      { general: { panelName: "" } },
      bearer(token),
    );
    expect(response.status).toBe(400);
  });

  it("viewer PATCH → 403 FORBIDDEN", async () => {
    const { token } = await setupOwner(app, env);
    await json(
      "POST",
      "/api/v1/admins",
      { username: "watcher", password: "password123", role: "viewer" },
      bearer(token),
    );
    const login = await json("POST", "/api/v1/auth/login", {
      username: "watcher",
      password: "password123",
    });
    const viewerToken = ((await login.json()) as { token: string }).token;

    const response = await json(
      "PATCH",
      "/api/v1/settings",
      { network: { ports: [443] } },
      bearer(viewerToken),
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("401 without a token", async () => {
    const response = await app.request("/api/v1/settings", {}, env);
    expect(response.status).toBe(401);
  });
});
