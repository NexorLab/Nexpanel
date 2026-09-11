import { Hono } from "hono";
import {
  ValidationError,
  hashPassword,
  sha256Hex,
  signJwt,
  verifyPassword,
} from "@nexpanel/core";
import type { AppEnv } from "../env";
import { jsonError } from "../errors";
import { requireAuth } from "../middleware/auth";
import { createRepositories } from "../storage/d1";

/**
 * /api/v1/auth — session lifecycle.
 *
 * GET   /status    { needsSetup } — true while the admins table is empty
 * POST  /setup     create the first owner (only while needsSetup); auto-login
 * POST  /login     { username, password } → { token, admin }
 * POST  /logout    revoke the presented token
 * PATCH /password  change own password; revokes ALL of the admin's sessions
 */

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 8;
const SESSION_TTL_SECONDS = 24 * 3600;

export const authRoutes = new Hono<AppEnv>();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

async function readCredentials(c: { req: { json: () => Promise<unknown> } }) {
  const body = (await c.req.json().catch(() => null)) as {
    username?: unknown;
    password?: unknown;
  } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
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
  return { username, password };
}

/** Issue a token, persist its session row, stamp last_login_at. */
async function issueSession(
  c: { env: AppEnv["Bindings"] },
  admin: { id: string; username: string; role: "owner" | "admin" | "viewer" },
) {
  const repos = createRepositories(c.env);
  const token = await signJwt({ sub: admin.id, role: admin.role }, c.env.JWT_SECRET);
  const expiresAt = now() + SESSION_TTL_SECONDS;
  await repos.sessions.create({
    id: crypto.randomUUID(),
    adminId: admin.id,
    tokenHash: await sha256Hex(token),
    expiresAt,
    createdAt: now(),
  });
  await repos.admins.update(admin.id, { lastLoginAt: now() });
  return token;
}

/** GET /status — public; drives the first-run setup page. */
authRoutes.get("/status", async (c) => {
  const repos = createRepositories(c.env);
  const needsSetup = (await repos.admins.count()) === 0;
  return c.json({ needsSetup });
});

/** POST /setup — public; creates the first owner and returns a live token. */
authRoutes.post("/setup", async (c) => {
  const repos = createRepositories(c.env);
  const credentials = await readCredentials(c);
  if ((await repos.admins.count()) > 0) {
    return jsonError(
      c,
      409,
      "SETUP_ALREADY_DONE",
      "An administrator already exists — log in instead.",
    );
  }

  const admin = await repos.admins.create({
    id: crypto.randomUUID(),
    username: credentials.username,
    role: "owner",
    isActive: true,
    lastLoginAt: null,
    passwordHash: await hashPassword(credentials.password),
  });
  const token = await issueSession(c, {
    id: admin.id,
    username: admin.username,
    role: admin.role,
  });
  return c.json(
    { token, admin: { id: admin.id, username: admin.username, role: admin.role } },
    201,
  );
});

/** POST /login — public. */
authRoutes.post("/login", async (c) => {
  const repos = createRepositories(c.env);
  const credentials = await readCredentials(c);
  // Opportunistic cleanup of expired session rows (no cron in this phase).
  await repos.sessions.deleteExpired(now());

  const admin = await repos.admins.getByUsername(credentials.username);
  // Identical error for unknown user and wrong password — no enumeration.
  if (!admin || !(await verifyPassword(credentials.password, admin.passwordHash))) {
    return jsonError(c, 401, "UNAUTHORIZED", "Invalid username or password.");
  }
  if (!admin.isActive) {
    return jsonError(c, 401, "UNAUTHORIZED", "Account disabled.");
  }

  const token = await issueSession(c, {
    id: admin.id,
    username: admin.username,
    role: admin.role,
  });
  return c.json({
    token,
    admin: { id: admin.id, username: admin.username, role: admin.role },
  });
});

/** POST /logout — requires auth; idempotent. */
authRoutes.post("/logout", requireAuth, async (c) => {
  const repos = createRepositories(c.env);
  const token = c.req.header("Authorization")!.slice("Bearer ".length).trim();
  await repos.sessions.deleteByTokenHash(await sha256Hex(token));
  return c.body(null, 204);
});

/** PATCH /password — requires auth; revokes every session of the admin. */
authRoutes.patch("/password", requireAuth, async (c) => {
  const auth = c.get("auth")!;
  const repos = createRepositories(c.env);

  const body = (await c.req.json().catch(() => null)) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  const admin = await repos.admins.getById(auth.adminId);
  if (!admin || !(await verifyPassword(currentPassword, admin.passwordHash))) {
    return jsonError(c, 400, "WRONG_PASSWORD", "Current password is incorrect.");
  }
  if (newPassword.length < PASSWORD_MIN) {
    throw new ValidationError(
      `Password must be at least ${PASSWORD_MIN} characters.`,
    );
  }

  await repos.admins.update(admin.id, {
    passwordHash: await hashPassword(newPassword),
  });
  // Revoke all sessions including the current one — the client must re-login.
  await repos.sessions.deleteByAdmin(admin.id);
  return c.body(null, 204);
});
