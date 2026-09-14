import { Hono } from "hono";
import { NotFoundError, ValidationError, type Config } from "@nexpanel/core";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";
import { buildConfigPayload } from "../services/configs";

/**
 * /api/v1/configs — generated proxy URIs (one per user×backend pair).
 *
 * GET    /         paginated list (?search=&protocol=&userId=&backendId=&page=&perPage=)
 * DELETE /:id      delete config
 * POST   /:id/rebuild   rebuild the URI from current user/backend data
 * POST   /generate { userId, backendIds } — idempotent upsert per pair
 */

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks"] as const;

export const configRoutes = new Hono<AppEnv>();

configRoutes.use("*", requireAuth);

function now(): number {
  return Math.floor(Date.now() / 1000);
}

configRoutes.get("/", async (c) => {
  const repos = createRepositories(c.env);
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(c.req.query("perPage")) || 20));
  const protocolParam = c.req.query("protocol");
  return c.json(
    await repos.configs.list({
      search: c.req.query("search") || undefined,
      protocol:
        protocolParam && (PROTOCOLS as readonly string[]).includes(protocolParam)
          ? (protocolParam as Config["protocol"])
          : undefined,
      userId: c.req.query("userId") || undefined,
      backendId: c.req.query("backendId") || undefined,
      page,
      perPage,
    }),
  );
});

configRoutes.delete("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  if (!(await repos.configs.getById(id))) throw new NotFoundError("Config");
  await repos.configs.delete(id);
  return c.body(null, 204);
});

configRoutes.post("/:id/rebuild", async (c) => {
  const repos = createRepositories(c.env);
  const config = await repos.configs.getById(c.req.param("id"));
  if (!config) throw new NotFoundError("Config");
  const user = await repos.users.getById(config.userId);
  const backend = await repos.backends.getById(config.backendId);
  if (!user || !backend) throw new NotFoundError("Config");

  // Upsert keeps id + created_at (the pair is UNIQUE) and refreshes
  // uri/isActive/updated_at from current data.
  return c.json(await repos.configs.upsert({ ...buildConfigPayload(user, backend), id: config.id }));
});

configRoutes.post("/generate", async (c) => {
  const repos = createRepositories(c.env);
  const body = (await c.req.json().catch(() => ({}))) as {
    userId?: unknown;
    backendIds?: unknown;
  };
  if (typeof body.userId !== "string" || body.userId.length === 0) {
    throw new ValidationError("userId is required.");
  }
  if (
    !Array.isArray(body.backendIds) ||
    body.backendIds.length === 0 ||
    !body.backendIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    throw new ValidationError("backendIds must be a non-empty array of ids.");
  }

  const user = await repos.users.getById(body.userId);
  if (!user) throw new NotFoundError("User");

  const generated: Config[] = [];
  for (const backendId of body.backendIds) {
    const backend = await repos.backends.getById(backendId);
    // Unknown or disabled backends are skipped — generation is a
    // best-effort sweep, mirroring the mock adapter's behavior.
    if (!backend || backend.status !== "active") continue;
    generated.push(await repos.configs.upsert(buildConfigPayload(user, backend)));
  }

  if (generated.length > 0) {
    await repos.activity.record({
      id: crypto.randomUUID(),
      messageKey: "dashboard.activity.configsGenerated",
      params: { count: generated.length, user: user.username },
      at: now(),
    });
  }
  return c.json(generated);
});
