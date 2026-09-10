import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth } from "../middleware/auth";

/**
 * /api/v1/backends — upstream proxy servers (protocol, transport, security).
 *
 * GET    /         list backends (?status=)
 * POST   /         create backend (admin+)
 * PATCH  /:id      update backend (admin+)
 * DELETE /:id      delete backend (admin+, cascades configs)
 * POST   /:id/test latency probe from the Worker to host:port
 */
export const backendRoutes = new Hono<{ Bindings: Env }>();

backendRoutes.use("*", requireAuth);

backendRoutes.get("/", (c) => notImplemented(c, "GET /api/v1/backends"));
backendRoutes.post("/", (c) => notImplemented(c, "POST /api/v1/backends"));
backendRoutes.patch("/:id", (c) => notImplemented(c, "PATCH /api/v1/backends/:id"));
backendRoutes.delete("/:id", (c) => notImplemented(c, "DELETE /api/v1/backends/:id"));
backendRoutes.post("/:id/test", (c) =>
  notImplemented(c, "POST /api/v1/backends/:id/test"),
);
