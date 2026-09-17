import type { createApp } from "../src/app";
import { bearer } from "./helpers";

/**
 * Shared fixtures for the CRUD route tests: every group seeds through
 * the public API itself, so tests exercise the real request path.
 */

type App = ReturnType<typeof createApp>;
type Env = { DB: unknown; JWT_SECRET: string };

export interface TestUser {
  id: string;
  uuid: string;
  username: string;
}

export interface TestBackend {
  id: string;
  name: string;
}

export async function createUser(
  app: App,
  env: Env,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const response = await app.request(
    "/api/v1/users",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(token) },
      body: JSON.stringify({ username: `user-${crypto.randomUUID().slice(0, 8)}`, ...overrides }),
    },
    env,
  );
  if (response.status !== 201) throw new Error(`createUser failed: ${response.status}`);
  return (await response.json()) as TestUser;
}

export async function createBackend(
  app: App,
  env: Env,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<TestBackend> {
  const response = await app.request(
    "/api/v1/backends",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(token) },
      body: JSON.stringify({
        name: `srv-${crypto.randomUUID().slice(0, 8)}`,
        protocol: "vless",
        host: "backend.example.com",
        port: 443,
        transport: "ws",
        security: "tls",
        sni: "backend.example.com",
        path: "/ws",
        ...overrides,
      }),
    },
    env,
  );
  if (response.status !== 201) throw new Error(`createBackend failed: ${response.status}`);
  return (await response.json()) as TestBackend;
}

export async function generateConfig(
  app: App,
  env: Env,
  token: string,
  userId: string,
  backendId: string,
): Promise<{ id: string; uri: string; isActive: boolean }> {
  const response = await app.request(
    "/api/v1/configs/generate",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(token) },
      body: JSON.stringify({ userId, backendIds: [backendId] }),
    },
    env,
  );
  if (response.status !== 200) throw new Error(`generateConfig failed: ${response.status}`);
  const configs = (await response.json()) as { id: string; uri: string; isActive: boolean }[];
  return configs[0];
}

export async function createSubscription(
  app: App,
  env: Env,
  token: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; token: string; name: string }> {
  const response = await app.request(
    "/api/v1/subscriptions",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(token) },
      body: JSON.stringify({ userId, name: "default", format: "base64", ...overrides }),
    },
    env,
  );
  if (response.status !== 201) throw new Error(`createSubscription failed: ${response.status}`);
  return (await response.json()) as { id: string; token: string; name: string };
}
