import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth } from "../middleware/auth";

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
export const userRoutes = new Hono<{ Bindings: Env }>();

userRoutes.use("*", requireAuth);

userRoutes.get("/", (c) => notImplemented(c, "GET /api/v1/users"));
userRoutes.post("/", (c) => notImplemented(c, "POST /api/v1/users"));
userRoutes.get("/:id", (c) => notImplemented(c, "GET /api/v1/users/:id"));
userRoutes.patch("/:id", (c) => notImplemented(c, "PATCH /api/v1/users/:id"));
userRoutes.delete("/:id", (c) => notImplemented(c, "DELETE /api/v1/users/:id"));
userRoutes.post("/:id/reset-uuid", (c) =>
  notImplemented(c, "POST /api/v1/users/:id/reset-uuid"),
);
