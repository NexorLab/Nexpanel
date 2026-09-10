import { Hono } from "hono";
import type { Env } from "./env";
import { errorBody } from "./errors";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { backendRoutes } from "./routes/backends";
import { configRoutes } from "./routes/configs";
import { subscriptionRoutes } from "./routes/subscriptions";
import { adminRoutes } from "./routes/admins";
import { settingsRoutes } from "./routes/settings";
import { statsRoutes } from "./routes/stats";
import { subRoutes } from "./routes/sub";

/**
 * NexPanel API — Hono app.
 *
 * Hono runs on Cloudflare Workers today and on Node/Deno/Bun later,
 * which is what makes the self-hosted migration a configuration change
 * rather than a rewrite (docs/architecture.md).
 *
 * Every /api/v1 route currently responds 501 NOT_IMPLEMENTED with the
 * final error envelope — the frontend mock adapter mirrors the same
 * contract, so swapping in the real adapter changes no UI code.
 */
export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  // Request id for log correlation (real implementation adds uuid).
  app.use("*", async (c, next) => {
    await next();
    c.header("x-nexpanel-request-id", c.req.header("cf-ray") ?? "local");
  });

  // Health probe — no auth.
  app.get("/api/v1/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

  // Public subscription delivery.
  app.route("/sub", subRoutes);

  // Authenticated panel API.
  const v1 = new Hono<{ Bindings: Env }>();
  v1.route("/auth", authRoutes);
  v1.route("/users", userRoutes);
  v1.route("/backends", backendRoutes);
  v1.route("/configs", configRoutes);
  v1.route("/subscriptions", subscriptionRoutes);
  v1.route("/admins", adminRoutes);
  v1.route("/settings", settingsRoutes);
  v1.route("/stats", statsRoutes);
  app.route("/api/v1", v1);

  // Unknown API path → structured 404 (never an HTML error page).
  app.notFound((c) =>
    c.json(errorBody("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}.`), 404),
  );

  // Uncaught errors → structured 500.
  app.onError((error, c) => {
    console.error("unhandled error:", error);
    return c.json(errorBody("INTERNAL", "Unexpected server error."), 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;

export const defaultApp = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return defaultApp.fetch(request, env, ctx);
  },
};
