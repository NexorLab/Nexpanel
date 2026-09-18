import {
  DEFAULT_SETTINGS,
  mergeSettings,
  validateGeneralSettings,
  validateNetworkSettings,
  type PanelSettings,
} from "@nexpanel/core";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requireAuth, requireRole } from "../middleware/auth";
import { createRepositories } from "../storage/d1";

/**
 * /api/v1/settings — instance-level panel settings stored as JSON rows
 * ("general", "network") in the settings table.
 *
 * GET   /        all settings, merged over DEFAULT_SETTINGS (self-healing;
 *                the read never writes rows)
 * PATCH /        section-level update { general?, network? }; each provided
 *                section is merged over the stored value, validated, saved
 *                (owner & admin; viewer → 403)
 */
export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use("*", requireAuth);

async function readSettings(repos: ReturnType<typeof createRepositories>): Promise<PanelSettings> {
  const storedGeneral = await repos.settings.get<PanelSettings["general"]>("general");
  const storedNetwork = await repos.settings.get<PanelSettings["network"]>("network");
  const patch: Partial<PanelSettings> = {};
  if (storedGeneral) patch.general = storedGeneral;
  if (storedNetwork) patch.network = storedNetwork;
  return mergeSettings(DEFAULT_SETTINGS, patch);
}

settingsRoutes.get("/", async (c) => {
  const repos = createRepositories(c.env);
  return c.json(await readSettings(repos));
});

settingsRoutes.patch("/", requireRole("admin"), async (c) => {
  const repos = createRepositories(c.env);
  const body = (await c.req.json().catch(() => null)) as {
    general?: unknown;
    network?: unknown;
  } | null;
  if (!body || (body.general === undefined && body.network === undefined)) {
    const current = await readSettings(repos);
    return c.json(current);
  }

  const patch: Partial<PanelSettings> = {};
  if (body.general !== undefined) {
    if (typeof body.general !== "object" || body.general === null) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "general must be an object." } },
        400,
      );
    }
    patch.general = body.general as PanelSettings["general"];
  }
  if (body.network !== undefined) {
    if (typeof body.network !== "object" || body.network === null) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "network must be an object." } },
        400,
      );
    }
    patch.network = body.network as PanelSettings["network"];
  }

  const merged = mergeSettings(await readSettings(repos), patch);
  if (patch.general) validateGeneralSettings(merged.general);
  if (patch.network) validateNetworkSettings(merged.network);

  if (patch.general) await repos.settings.set("general", merged.general);
  if (patch.network) await repos.settings.set("network", merged.network);
  return c.json(merged);
});
