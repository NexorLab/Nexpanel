/// <reference types="@cloudflare/workers-types" />

/**
 * NexPanel panel worker — serves the built SPA and proxies the API.
 *
 * The panel calls the API with relative paths only (docs/architecture.md),
 * so production serves both from one origin. Workers Assets serves the
 * static files; this worker handles everything Assets does not, which is
 * exactly two kinds of traffic:
 *
 *   /api/…  → forwarded to the nexpanel-api worker over a service binding
 *            (same-origin from the browser's point of view, so no CORS
 *            preflight is ever needed)
 *   other  → an SPA route, served index.html through the ASSETS binding
 *
 * The API is reached through a *service binding*, not an outbound fetch.
 * Worker-to-worker fetches over *.workers.dev are blocked by Cloudflare
 * (error 1042), and a binding also keeps the traffic inside the platform —
 * no egress, no extra hop. The API stays a separate worker so it can be
 * scaled, monitored and later re-pointed at a self-hosted origin on its own.
 */

const API_PREFIX = "/api/";

interface PanelEnv {
  /** Workers Assets binding (wrangler.jsonc → assets.binding). */
  ASSETS: Fetcher;
  /** Service binding to the nexpanel-api worker (wrangler.jsonc → services). */
  API: Fetcher;
}

export default {
  async fetch(request: Request, env: PanelEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith(API_PREFIX)) {
      return proxyToApi(request, env);
    }

    // A SPA route (or a stale asset path). The ASSETS binding serves the
    // file if one exists and otherwise index.html, per
    // assets.not_found_handling in wrangler.jsonc.
    return env.ASSETS.fetch(request);
  },
};

async function proxyToApi(request: Request, env: PanelEnv): Promise<Response> {
  // The service binding dispatches on the request path and query, and
  // ignores the host — a new Request carrying the incoming pathname is
  // built so nothing from the panel's own origin leaks into the API.
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, "http://api.local");

  // GET/HEAD must not carry a body — request.body is a ReadableStream and
  // passing it through unconditionally crashes the request.
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const apiRequest = new Request(target, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    // The binding call runs inside this worker; a subrequest that fails
    // must not bubble up as an unhandled crash.
    cf: request.cf,
  });

  const response = await env.API.fetch(apiRequest);

  // Pass the API's response through verbatim — status, headers and body are
  // its contract with the panel (docs/api.md).
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
