import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth, requireRole } from "../middleware/auth";

/**
 * /api/v1/auth — login/logout endpoints.
 *
 * POST /login    { username, password } → { token, admin }
 * POST /logout   invalidate current session
 */
export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/login", (c) => notImplemented(c, "POST /api/v1/auth/login"));

authRoutes.post("/logout", requireAuth, (c) =>
  notImplemented(c, "POST /api/v1/auth/logout"),
);

export const ownerOnly = requireRole("owner");
