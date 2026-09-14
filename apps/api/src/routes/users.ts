import { Hono } from "hono";
import { NotFoundError, ValidationError, type ConfigUser } from "@nexpanel/core";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";
import { buildConfigPayload } from "../services/configs";

/**
 * /api/v1/users — config-consumer accounts (UUID, quota, expiry, IP limit).
 *
 * GET    /            paginated list (?search=&status=&page=&perPage=)
 * POST   /            create user
 * GET    /:id         single user
 * PATCH  /:id         update user
 * DELETE /:id         delete user (cascades configs + subscriptions)
 * POST   /:id/reset-uuid   regenerate the user's UUID (rebuilds configs)
 */

const STATUSES = ["active", "disabled"] as const;
const USERNAME_MAX = 64;

export const userRoutes = new Hono<AppEnv>();

userRoutes.use("*", requireAuth);

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function requireString(value: unknown, field: string, max = 255): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters.`);
  }
  return trimmed;
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer.`);
  }
  return value;
}

/** Body-level validation for POST /; returns the create payload. */
function parseCreateBody(body: Record<string, unknown>) {
  const username = requireString(body.username, "Username", USERNAME_MAX);
  const note =
    body.note === undefined || body.note === null ? null : requireString(body.note, "Note");
  const quotaBytes = body.quotaBytes === undefined ? 0 : requireNonNegativeInt(body.quotaBytes, "quotaBytes");
  const expiryAt =
    body.expiryAt === undefined || body.expiryAt === null
      ? null
      : requireNonNegativeInt(body.expiryAt, "expiryAt");
  const ipLimit = body.ipLimit === undefined ? 0 : requireNonNegativeInt(body.ipLimit, "ipLimit");
  const status =
    body.status === undefined ? "active" : parseStatus(body.status);
  return { username, note, quotaBytes, expiryAt, ipLimit, status };
}

function parseStatus(value: unknown): ConfigUser["status"] {
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) {
    return value as ConfigUser["status"];
  }
  throw new ValidationError("Status must be active or disabled.");
}

userRoutes.get("/", async (c) => {
  const repos = createRepositories(c.env);
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(c.req.query("perPage")) || 20));
  const search = c.req.query("search") || undefined;
  const statusParam = c.req.query("status");
  const status =
    statusParam && (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as ConfigUser["status"])
      : undefined;
  return c.json(await repos.users.list({ search, status, page, perPage }));
});

userRoutes.post("/", async (c) => {
  const repos = createRepositories(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseCreateBody(body);

  const user = await repos.users.create({
    id: crypto.randomUUID(),
    uuid: crypto.randomUUID(),
    ...parsed,
    usedBytes: 0,
  });
  await repos.activity.record({
    id: crypto.randomUUID(),
    messageKey: "dashboard.activity.userCreated",
    params: { name: user.username },
    at: now(),
  });
  return c.json(user, 201);
});

userRoutes.get("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const user = await repos.users.getById(c.req.param("id"));
  if (!user) throw new NotFoundError("User");
  return c.json(user);
});

userRoutes.patch("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  if (!(await repos.users.getById(id))) throw new NotFoundError("User");

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<Omit<ConfigUser, "id" | "createdAt">> = {};
  if (body.username !== undefined) patch.username = requireString(body.username, "Username", USERNAME_MAX);
  if (body.note !== undefined) {
    patch.note = body.note === null ? null : requireString(body.note, "Note");
  }
  if (body.quotaBytes !== undefined) patch.quotaBytes = requireNonNegativeInt(body.quotaBytes, "quotaBytes");
  if (body.usedBytes !== undefined) patch.usedBytes = requireNonNegativeInt(body.usedBytes, "usedBytes");
  if (body.expiryAt !== undefined) {
    patch.expiryAt = body.expiryAt === null ? null : requireNonNegativeInt(body.expiryAt, "expiryAt");
  }
  if (body.ipLimit !== undefined) patch.ipLimit = requireNonNegativeInt(body.ipLimit, "ipLimit");
  if (body.status !== undefined) patch.status = parseStatus(body.status);

  const user = await repos.users.update(id, patch);
  if (patch.status === "disabled") {
    await repos.activity.record({
      id: crypto.randomUUID(),
      messageKey: "dashboard.activity.userDisabled",
      params: { name: user.username },
      at: now(),
    });
  }
  return c.json(user);
});

userRoutes.delete("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  if (!(await repos.users.getById(id))) throw new NotFoundError("User");
  await repos.users.delete(id); // configs/subscriptions cascade via FK
  return c.body(null, 204);
});

userRoutes.post("/:id/reset-uuid", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  const user = await repos.users.getById(id);
  if (!user) throw new NotFoundError("User");

  // New credential, then rebuild every derived URI against it.
  const updated = await repos.users.update(id, { uuid: crypto.randomUUID() });
  const { data: userConfigs } = await repos.configs.list({
    userId: id,
    page: 1,
    perPage: 1000,
  });
  for (const config of userConfigs) {
    const backend = await repos.backends.getById(config.backendId);
    if (!backend) continue;
    await repos.configs.upsert({
      ...buildConfigPayload(updated, backend),
      id: config.id, // upsert keeps the existing row (pair is UNIQUE)
    });
  }
  return c.json(updated);
});
