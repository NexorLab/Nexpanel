import { Hono } from "hono";
import { ConflictError, NotFoundError, ValidationError, hashPassword } from "@nexpanel/core";
import type { AppEnv } from "../env";
import { jsonError } from "../errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { createRepositories } from "../storage/d1";

/**
 * /api/v1/admins — panel administrators (owner/admin/viewer roles).
 * Mutations are owner-only; every admin may list. Password change goes
 * through /auth/password; sessions need no manual revocation here since
 * requireAuth re-reads role/isActive from the DB on every request.
 *
 * GET    /        list admins
 * POST   /        create admin (owner)
 * PATCH  /:id     change role / active flag (owner)
 * DELETE /:id     delete admin (owner; cannot delete self or last owner)
 */

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 8;
const ROLES = ["owner", "admin", "viewer"] as const;

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth);

adminRoutes.get("/", async (c) => {
  const repos = createRepositories(c.env);
  return c.json(await repos.admins.list());
});

adminRoutes.post("/", requireRole("owner"), async (c) => {
  const repos = createRepositories(c.env);
  const body = (await c.req.json().catch(() => null)) as {
    username?: unknown;
    password?: unknown;
    role?: unknown;
  } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role;
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError(
      "Username must be 3-32 characters (letters, digits, . _ -).",
    );
  }
  if (password.length < PASSWORD_MIN) {
    throw new ValidationError(
      `Password must be at least ${PASSWORD_MIN} characters.`,
    );
  }
  if (typeof role !== "string" || !ROLES.includes(role as (typeof ROLES)[number])) {
    throw new ValidationError("Role must be owner, admin or viewer.");
  }

  const admin = await repos.admins.create({
    id: crypto.randomUUID(),
    username,
    role: role as (typeof ROLES)[number],
    isActive: true,
    lastLoginAt: null,
    passwordHash: await hashPassword(password),
  });
  return c.json(admin, 201);
});

adminRoutes.patch("/:id", requireRole("owner"), async (c) => {
  const auth = c.get("auth")!;
  const repos = createRepositories(c.env);
  const id = c.req.param("id");

  const target = await repos.admins.getById(id);
  if (!target) throw new NotFoundError("Admin");

  const body = (await c.req.json().catch(() => null)) as {
    role?: unknown;
    isActive?: unknown;
  } | null;
  const role = body?.role === undefined ? undefined : body.role;
  const isActive = body?.isActive === undefined ? undefined : body.isActive;
  if (role !== undefined && (typeof role !== "string" || !ROLES.includes(role as (typeof ROLES)[number]))) {
    throw new ValidationError("Role must be owner, admin or viewer.");
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new ValidationError("isActive must be a boolean.");
  }

  if (id === auth.adminId && isActive === false) {
    return jsonError(c, 409, "CONFLICT", "You cannot deactivate your own account.");
  }

  const losesOwner = target.role === "owner" &&
    ((typeof role === "string" && role !== "owner") || isActive === false);
  if (losesOwner && (await repos.admins.countOwnersExcluding(id)) === 0) {
    throw new ConflictError(
      "LAST_OWNER",
      "Cannot demote or deactivate the last owner.",
    );
  }

  const patch: { role?: (typeof ROLES)[number]; isActive?: boolean } = {};
  if (role !== undefined) patch.role = role as (typeof ROLES)[number];
  if (isActive !== undefined) patch.isActive = isActive;
  return c.json(await repos.admins.update(id, patch));
});

adminRoutes.delete("/:id", requireRole("owner"), async (c) => {
  const auth = c.get("auth")!;
  const repos = createRepositories(c.env);
  const id = c.req.param("id");

  const target = await repos.admins.getById(id);
  if (!target) throw new NotFoundError("Admin");

  if (id === auth.adminId) {
    return jsonError(c, 409, "CONFLICT", "You cannot delete your own account.");
  }
  if (target.role === "owner" && (await repos.admins.countOwnersExcluding(id)) === 0) {
    throw new ConflictError("LAST_OWNER", "Cannot delete the last owner.");
  }

  await repos.admins.delete(id); // sessions cascade via FK
  return c.body(null, 204);
});
