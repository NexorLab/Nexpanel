import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { jsonError } from "../errors";

/**
 * JWT (HS256) verification via WebCrypto — runs identically on Workers
 * and Node, so the same middleware can be reused when the API is
 * self-hosted (docs/architecture.md → portability).
 *
 * Signature verification is wired in the backend implementation phase;
 * for now the middleware only enforces the presence of a Bearer token
 * so 401 semantics are observable end-to-end.
 */

export const ADMIN_ROLE_HEADER = "x-nexpanel-role";

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonError(c, 401, "UNAUTHORIZED", "Missing bearer token.");
  }
  // Token verification against JWT_SECRET happens in the implementation
  // phase; the skeleton only asserts the header shape.
  await next();
};

/**
 * Role gate. Usage: `router.get('/', requireAuth, requireRole('owner'), handler)`
 * Roles are ordered: owner > admin > viewer.
 */
export function requireRole(
  minimum: "owner" | "admin" | "viewer",
): MiddlewareHandler<{ Bindings: Env }> {
  const rank = { owner: 3, admin: 2, viewer: 1 } as const;
  return async (c, next) => {
    const role = c.req.header(ADMIN_ROLE_HEADER) as keyof typeof rank | undefined;
    // The real implementation reads the role from the verified JWT claims;
    // the header is a stand-in so the contract is testable from day one.
    if (!role || rank[role] < rank[minimum]) {
      return jsonError(c, 403, "FORBIDDEN", `Requires ${minimum} role.`);
    }
    await next();
  };
}
