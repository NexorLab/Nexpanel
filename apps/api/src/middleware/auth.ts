import { ROLE_RANK, sha256Hex, verifyJwt } from "@nexpanel/core";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { jsonError } from "../errors";
import { createSessionRepository } from "../storage/d1/sessions";

/**
 * JWT (HS256) verification via WebCrypto — runs identically on Workers
 * and Node, so the same middleware is reused when the API is self-hosted
 * (docs/architecture.md → portability).
 *
 * The JWT only authenticates; role and active status are re-read from
 * the DB on every request (one indexed JOIN), so demotions/deactivations
 * take effect immediately instead of at token expiry.
 */

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonError(c, 401, "UNAUTHORIZED", "Missing bearer token.");
  }
  const token = authorization.slice("Bearer ".length).trim();

  const claims = await verifyJwt(token, c.env.JWT_SECRET);
  if (!claims) {
    return jsonError(c, 401, "UNAUTHORIZED", "Invalid or expired token.");
  }

  const session = await createSessionRepository(c.env.DB).getAuthByTokenHash(
    await sha256Hex(token),
  );
  if (!session) {
    return jsonError(c, 401, "UNAUTHORIZED", "Session revoked.");
  }
  if (session.expiresAt < Math.floor(Date.now() / 1000)) {
    return jsonError(c, 401, "UNAUTHORIZED", "Session expired.");
  }
  if (!session.admin.isActive) {
    return jsonError(c, 401, "UNAUTHORIZED", "Account disabled.");
  }

  c.set("auth", {
    adminId: session.admin.id,
    username: session.admin.username,
    role: session.admin.role,
  });
  await next();
};

/**
 * Role gate — reads the DB-verified identity requireAuth put in context.
 * Usage: `router.get('/', requireAuth, requireRole('owner'), handler)`
 * Roles are ordered: owner > admin > viewer.
 */
export function requireRole(minimum: "owner" | "admin" | "viewer"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      return jsonError(c, 401, "UNAUTHORIZED", "Authentication required.");
    }
    if (ROLE_RANK[auth.role] < ROLE_RANK[minimum]) {
      return jsonError(c, 403, "FORBIDDEN", `Requires ${minimum} role.`);
    }
    await next();
  };
}
