import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth } from "../middleware/auth";

/**
 * /api/v1/stats — dashboard aggregates
 * (totals, 7-day series, per-protocol breakdown, activity feed).
 */
export const statsRoutes = new Hono<{ Bindings: Env }>();

statsRoutes.use("*", requireAuth);

statsRoutes.get("/overview", (c) => notImplemented(c, "GET /api/v1/stats/overview"));
