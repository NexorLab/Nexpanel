import { createFakeD1 } from "./fake-d1";
import { createApp } from "../src/app";
import type { Env } from "../src/env";

export const TEST_SECRET = "test-secret-for-jwt-signing";

/** Fresh app + fake D1 per test; use with app.request(url, init, env). */
export function makeTestEnv() {
  const app = createApp();
  const env = {
    DB: createFakeD1() as unknown as Env["DB"],
    JWT_SECRET: TEST_SECRET,
  };
  return { app, env };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function setupOwner(
  app: ReturnType<typeof createApp>,
  env: { DB: unknown; JWT_SECRET: string },
  username = "owner",
  password = "password123",
) {
  const response = await app.request(
    "/api/v1/auth/setup",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    },
    env,
  );
  const body = (await response.json()) as {
    token: string;
    admin: { id: string; username: string; role: string };
  };
  return { response, ...body };
}

export async function loginAs(
  app: ReturnType<typeof createApp>,
  env: { DB: unknown; JWT_SECRET: string },
  username: string,
  password: string,
) {
  const response = await app.request(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    },
    env,
  );
  const body = (await response.json()) as {
    token: string;
    admin: { id: string; username: string; role: string };
  };
  return { response, ...body };
}
