import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth } from "../middleware/auth";

/**
 * /api/v1/subscriptions — shareable /sub/:token links per user.
 *
 * GET    /                 list subscriptions (?userId=)
 * POST   /                 create subscription (admin+)
 * PATCH  /:id              update name/format/expiry (admin+)
 * DELETE /:id              delete subscription (admin+)
 * POST   /:id/rotate-token invalidate the current token, issue a new one
 */
export const subscriptionRoutes = new Hono<{ Bindings: Env }>();

subscriptionRoutes.use("*", requireAuth);

subscriptionRoutes.get("/", (c) => notImplemented(c, "GET /api/v1/subscriptions"));
subscriptionRoutes.post("/", (c) => notImplemented(c, "POST /api/v1/subscriptions"));
subscriptionRoutes.patch("/:id", (c) =>
  notImplemented(c, "PATCH /api/v1/subscriptions/:id"),
);
subscriptionRoutes.delete("/:id", (c) =>
  notImplemented(c, "DELETE /api/v1/subscriptions/:id"),
);
subscriptionRoutes.post("/:id/rotate-token", (c) =>
  notImplemented(c, "POST /api/v1/subscriptions/:id/rotate-token"),
);
