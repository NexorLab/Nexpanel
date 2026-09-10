import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";
import { requireAuth, requireRole } from "../middleware/auth";

/**
 * /api/v1/admins — panel administrators (owner/admin/viewer roles).
 * Mutations are owner-only; every admin may list.
 *
 * GET    /        list admins
 * POST   /        create admin (owner)
 * PATCH  /:id     change role / active flag (owner)
 * DELETE /:id     delete admin (owner; cannot delete self or last owner)
 */
export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use("*", requireAuth);

adminRoutes.get("/", (c) => notImplemented(c, "GET /api/v1/admins"));
adminRoutes.post("/", requireRole("owner"), (c) =>
  notImplemented(c, "POST /api/v1/admins"),
);
adminRoutes.patch("/:id", requireRole("owner"), (c) =>
  notImplemented(c, "PATCH /api/v1/admins/:id"),
);
adminRoutes.delete("/:id", requireRole("owner"), (c) =>
  notImplemented(c, "DELETE /api/v1/admins/:id"),
);
