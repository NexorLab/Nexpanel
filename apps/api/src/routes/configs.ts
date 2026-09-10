import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth } from "../middleware/auth";

/**
 * /api/v1/configs — generated proxy URIs (one per user × backend).
 *
 * GET    /              paginated list (?search=&protocol=&userId=&backendId=)
 * DELETE /:id           delete a config
 * POST   /:id/rebuild   regenerate the URI from current user + backend data
 * POST   /generate      { userId, backendIds } → Config[] (idempotent per pair)
 */
export const configRoutes = new Hono<{ Bindings: Env }>();

configRoutes.use("*", requireAuth);

configRoutes.get("/", (c) => notImplemented(c, "GET /api/v1/configs"));
configRoutes.delete("/:id", (c) => notImplemented(c, "DELETE /api/v1/configs/:id"));
configRoutes.post("/:id/rebuild", (c) =>
  notImplemented(c, "POST /api/v1/configs/:id/rebuild"),
);
configRoutes.post("/generate", (c) =>
  notImplemented(c, "POST /api/v1/configs/generate"),
);
