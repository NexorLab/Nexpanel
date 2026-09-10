import { Hono } from "hono";
import type { Env } from "../env";
import { notImplemented } from "../errors";

/**
 * Public subscription endpoint — the one route that does NOT require
 * authentication. Proxy clients (v2rayNG, Streisand, Hiddify, clash…)
 * fetch `/sub/:token` and receive the rendered subscription document
 * in the format stored on the subscription.
 *
 * GET /sub/:token            → configured format (default: base64)
 * GET /sub/:token?format=…   → override (base64 | plain | clash | singbox)
 */
export const subRoutes = new Hono<{ Bindings: Env }>();

subRoutes.get("/:token", (c) => notImplemented(c, "GET /sub/:token"));
