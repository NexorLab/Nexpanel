import { Hono } from "hono";
import { NotFoundError, ValidationError, type Subscription } from "@nexpanel/core";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";

/**
 * /api/v1/subscriptions — shareable links for a user's configs.
 *
 * GET    /          list (?userId=)
 * POST   /          create subscription
 * PATCH  /:id       { name?, format?, expiresAt? }
 * DELETE /:id       delete subscription
 * POST   /:id/rotate-token   new token; old links die immediately
 */

const FORMATS = ["base64", "plain", "clash", "singbox"] as const;

export const subscriptionRoutes = new Hono<AppEnv>();

subscriptionRoutes.use("*", requireAuth);

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function requireName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 64) {
    throw new ValidationError("name must be 1-64 characters.");
  }
  return value.trim();
}

function requireFormat(value: unknown): Subscription["format"] {
  if (typeof value === "string" && (FORMATS as readonly string[]).includes(value)) {
    return value as Subscription["format"];
  }
  throw new ValidationError("format must be one of: base64, plain, clash, singbox.");
}

/** Unguessable delivery token: 16 random bytes, hex-encoded (32 chars). */
function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

subscriptionRoutes.get("/", async (c) => {
  const repos = createRepositories(c.env);
  return c.json(await repos.subscriptions.list({ userId: c.req.query("userId") || undefined }));
});

subscriptionRoutes.post("/", async (c) => {
  const repos = createRepositories(c.env);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.userId !== "string" || body.userId.length === 0) {
    throw new ValidationError("userId is required.");
  }
  if (!(await repos.users.getById(body.userId))) throw new NotFoundError("User");

  const subscription = await repos.subscriptions.create({
    id: crypto.randomUUID(),
    userId: body.userId,
    token: newToken(),
    name: requireName(body.name),
    format: requireFormat(body.format),
    includeInactive: false,
    expiresAt: null,
    lastAccessAt: null,
    accessCount: 0,
  });
  return c.json(subscription, 201);
});

subscriptionRoutes.patch("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  if (!(await repos.subscriptions.getById(id))) throw new NotFoundError("Subscription");

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<Omit<Subscription, "id" | "userId" | "token" | "createdAt">> = {};
  if (body.name !== undefined) patch.name = requireName(body.name);
  if (body.format !== undefined) patch.format = requireFormat(body.format);
  if (body.includeInactive !== undefined) {
    if (typeof body.includeInactive !== "boolean") {
      throw new ValidationError("includeInactive must be a boolean.");
    }
    patch.includeInactive = body.includeInactive;
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null) {
      patch.expiresAt = null;
    } else if (typeof body.expiresAt === "number" && Number.isInteger(body.expiresAt) && body.expiresAt >= 0) {
      patch.expiresAt = body.expiresAt;
    } else {
      throw new ValidationError("expiresAt must be a non-negative integer or null.");
    }
  }
  return c.json(await repos.subscriptions.update(id, patch));
});

subscriptionRoutes.delete("/:id", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  if (!(await repos.subscriptions.getById(id))) throw new NotFoundError("Subscription");
  await repos.subscriptions.delete(id);
  return c.body(null, 204);
});

subscriptionRoutes.post("/:id/rotate-token", async (c) => {
  const repos = createRepositories(c.env);
  const id = c.req.param("id");
  const subscription = await repos.subscriptions.update(id, {
    token: newToken(),
    accessCount: 0,
    lastAccessAt: null,
  });

  await repos.activity.record({
    id: crypto.randomUUID(),
    messageKey: "dashboard.activity.subRotated",
    params: { name: subscription.name },
    at: now(),
  });
  return c.json(subscription);
});
