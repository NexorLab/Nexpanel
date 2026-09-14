import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";

/**
 * /api/v1/stats — dashboard aggregates
 * (totals, 7-day series, per-protocol breakdown, activity feed).
 *
 * GET /overview → totals + configsPerDay(×7) + byProtocol + activity.
 * Activity is composed here from the feed repository: the wire shape
 * (docs/api.md) keeps it alongside the totals.
 */
export const statsRoutes = new Hono<AppEnv>();

statsRoutes.use("*", requireAuth);

const ACTIVITY_FEED_LIMIT = 20;

statsRoutes.get("/overview", async (c) => {
  const repos = createRepositories(c.env);
  const [overview, activity] = await Promise.all([
    repos.stats.overview(),
    repos.activity.list(ACTIVITY_FEED_LIMIT),
  ]);
  return c.json({ ...overview, activity });
});
