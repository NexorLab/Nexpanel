import { describe, expect, it } from "vitest";

/**
 * The panel worker serves the SPA and forwards API-owned paths to the API
 * worker over a service binding (src/index.ts, API_PREFIXES). Both bindings
 * are stubbed here — this asserts the routing contract only, not the API's
 * behavior, which apps/api covers separately.
 *
 * The regression guarded here: /sub/:token must reach the API. The panel
 * builds subscription URLs against its own origin, so a path the proxy
 * does not recognize falls through to Workers Assets and a client
 * importing a config receives index.html instead of the subscription body.
 */

// Workers globals (Request/Response) come from @cloudflare/workers-types
// via tsconfig, matching the runtime the worker deploys to.
const worker = (await import("../src/index.ts")) as {
  default: {
    fetch: (request: Request, env: Record<string, { fetch: (r: Request) => Promise<Response> }>) => Promise<Response>;
  };
};

/** Records what the proxy actually forwarded, instead of answering. */
function recordingBinding(name: string, seen: string[]) {
  return {
    fetch(request: Request) {
      const url = new URL(request.url);
      seen.push(`${name} ${request.method} ${url.pathname}${url.search}`);
      return Promise.resolve(
        new Response(name, { status: 200, headers: { "content-type": "text/plain" } }),
      );
    },
  };
}

function envWith(seen: string[]) {
  return {
    ASSETS: recordingBinding("ASSETS", seen),
    API: recordingBinding("API", seen),
  };
}

describe("panel worker routing", () => {
  it("forwards /api/ paths to the API binding", async () => {
    const seen: string[] = [];
    const response = await worker.default.fetch(
      new Request("https://panel.example.com/api/v1/users?perPage=10"),
      envWith(seen),
    );
    expect(seen).toEqual(["API GET /api/v1/users?perPage=10"]);
    expect(response.status).toBe(200);
  });

  it("forwards the public /sub/:token path to the API binding", async () => {
    const seen: string[] = [];
    await worker.default.fetch(
      new Request("https://panel.example.com/sub/test-subscription-token"),
      envWith(seen),
    );
    // The panel hands out this exact URL shape; it must not resolve to the SPA.
    expect(seen).toEqual(["API GET /sub/test-subscription-token"]);
  });

  it("serves an unmatched path as an SPA route through ASSETS", async () => {
    const seen: string[] = [];
    const response = await worker.default.fetch(
      new Request("https://panel.example.com/users"),
      envWith(seen),
    );
    expect(seen).toEqual(["ASSETS GET /users"]);
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("does not treat a merely similar path as API-owned", async () => {
    // The prefix is "/sub/", not "/sub", so /subscriptions/… stays a SPA route.
    const seen: string[] = [];
    await worker.default.fetch(
      new Request("https://panel.example.com/subscriptions/abc"),
      envWith(seen),
    );
    expect(seen).toEqual(["ASSETS GET /subscriptions/abc"]);
  });
});
