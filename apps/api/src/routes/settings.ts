import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth, requireRole } from "../middleware/auth";

/**
 * /api/v1/settings — instance-level key/value settings
 * (panel name, URLs, defaults). Reads require any admin;
 * writes are owner-only.
 *
 * GET   /        all settings as a flat object
 * PATCH /        partial update { key: value, ... }
 */
export const settingsRoutes = new Hono<{ Bindings: Env }>();

settingsRoutes.use("*", requireAuth);

settingsRoutes.get("/", (c) => notImplemented(c, "GET /api/v1/settings"));
settingsRoutes.patch("/", requireRole("owner"), (c) =>
  notImplemented(c, "PATCH /api/v1/settings"),
);
