import { Hono } from "hono";
import { renderSubscriptionBody, type SubConfigSource } from "@nexpanel/core";
import type { AppEnv } from "../env";
import { jsonError } from "../errors";
import { createRepositories } from "../storage/d1";

/**
 * Public subscription endpoint — the one route group that does NOT
 * require authentication. Proxy clients (v2rayNG, Streisand, Hiddify,
 * clash…) fetch `/sub/:token` and receive the rendered subscription
 * document in the format stored on the subscription.
 *
 * GET /sub/:token            → configured format (default: base64)
 * GET /sub/:token?format=…   → override (base64 | plain | clash | singbox)
 *
 * Unknown token or expired subscription → 404 envelope (no leak of
 * whether the token ever existed). Each hit updates access_count and
 * last_access_at.
 */

const FORMATS = ["base64", "plain", "clash", "singbox"] as const;

const CONTENT_TYPES: Record<(typeof FORMATS)[number], string> = {
  base64: "text/plain; charset=utf-8",
  plain: "text/plain; charset=utf-8",
  clash: "text/yaml; charset=utf-8",
  singbox: "application/json; charset=utf-8",
};

export const subRoutes = new Hono<AppEnv>();

subRoutes.get("/:token", async (c) => {
  const repos = createRepositories(c.env);
  const token = c.req.param("token");
  const subscription = await repos.subscriptions.getByToken(token);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!subscription || (subscription.expiresAt !== null && subscription.expiresAt < nowSeconds)) {
    return jsonError(c, 404, "NOT_FOUND", "Subscription not found or expired.");
  }

  const formatParam = c.req.query("format");
  const format =
    formatParam && (FORMATS as readonly string[]).includes(formatParam)
      ? (formatParam as (typeof FORMATS)[number])
      : subscription.format;

  const user = await repos.users.getById(subscription.userId);
  // Fail closed: a disabled user delivers nothing, even with
  // includeInactive set — the panel is the only way to re-enable.
  if (!user || user.status !== "active") {
    return c.body("", 200, { "content-type": CONTENT_TYPES[format] });
  }

  const { data: configs } = await repos.configs.list({
    userId: user.id,
    page: 1,
    perPage: 1000,
  });
  const deliverable = configs.filter(
    (config) => subscription.includeInactive || config.isActive,
  );
  // One backends read total; a user's configs reference few backends.
  const byId = new Map((await repos.backends.list()).map((backend) => [backend.id, backend]));
  const sources: SubConfigSource[] = [];
  for (const config of deliverable) {
    const backend = byId.get(config.backendId);
    if (backend) sources.push({ config, backend, user });
  }

  await repos.subscriptions.recordAccess(token);
  return c.body(renderSubscriptionBody(sources, format), 200, {
    "content-type": CONTENT_TYPES[format],
  });
});
