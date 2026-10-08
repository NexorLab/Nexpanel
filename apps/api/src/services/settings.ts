import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type PanelSettings,
} from "@nexpanel/core";
import type { createRepositories } from "../storage/d1";

/**
 * Settings read shared by the authenticated settings routes and the
 * public subscription endpoint. The merge over DEFAULT_SETTINGS is the
 * self-healing path: a missing or partial stored row still yields a
 * complete settings object, so /sub never 500s over a half-written row.
 */
export async function readSettings(
  repos: ReturnType<typeof createRepositories>,
): Promise<PanelSettings> {
  const storedGeneral = await repos.settings.get<PanelSettings["general"]>("general");
  const storedNetwork = await repos.settings.get<PanelSettings["network"]>("network");
  const patch: Partial<PanelSettings> = {};
  if (storedGeneral) patch.general = storedGeneral;
  if (storedNetwork) patch.network = storedNetwork;
  return mergeSettings(DEFAULT_SETTINGS, patch);
}
