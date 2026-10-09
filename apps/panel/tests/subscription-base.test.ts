/**
 * Subscription link base resolution.
 *
 * Links were previously built from window.location.origin, which silently
 * breaks behind a custom domain — the copied /sub/<token> URL points at the
 * panel's host instead of the one the admin configured. The stored
 * general.subscriptionBaseUrl now wins, with two deliberate fallbacks: the
 * shipped placeholder is treated as "not configured" and an empty value
 * means "use this origin", so a default install keeps working unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "@nexpanel/core";

import { resolveSubscriptionBase } from "../src/pages/Subscriptions/Subscriptions";

const CUSTOM = "https://panel.mydomain.com";

function withBaseUrl(subscriptionBaseUrl: string) {
  return {
    ...DEFAULT_SETTINGS,
    general: { ...DEFAULT_SETTINGS.general, subscriptionBaseUrl },
  };
}

describe("resolveSubscriptionBase", () => {
  const REAL_ORIGIN = "https://real-origin.example";

  beforeEach(() => {
    // No jsdom here: stub a window.location on the bare global so the
    // fallback branch has something to read.
    vi.stubGlobal("window", { location: { origin: REAL_ORIGIN } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the configured base when an admin set a custom domain", () => {
    expect(resolveSubscriptionBase(withBaseUrl(CUSTOM))).toBe(CUSTOM);
  });

  it("strips trailing slashes from the configured base", () => {
    expect(resolveSubscriptionBase(withBaseUrl(`${CUSTOM}/`))).toBe(CUSTOM);
    expect(resolveSubscriptionBase(withBaseUrl(`${CUSTOM}//`))).toBe(CUSTOM);
  });

  it("strips a duplicated trailing /sub so the join does not double it", () => {
    // The field is a subscription base, so it conventionally ends in /sub.
    // Leaving it would produce /sub/sub/<token> and a dead link.
    expect(resolveSubscriptionBase(withBaseUrl(`${CUSTOM}/sub`))).toBe(CUSTOM);
    expect(resolveSubscriptionBase(withBaseUrl(`${CUSTOM}/sub/`))).toBe(CUSTOM);
  });

  it("falls back to the current origin for the shipped placeholder", () => {
    // The default is a placeholder, not a real address.
    expect(
      resolveSubscriptionBase(withBaseUrl(DEFAULT_SETTINGS.general.subscriptionBaseUrl)),
    ).toBe(REAL_ORIGIN);
  });

  it("falls back to the current origin when the base is blank", () => {
    expect(resolveSubscriptionBase(withBaseUrl(""))).toBe(REAL_ORIGIN);
    expect(resolveSubscriptionBase(withBaseUrl("   "))).toBe(REAL_ORIGIN);
  });

  it("falls back to the current origin when settings have not loaded yet", () => {
    expect(resolveSubscriptionBase(null)).toBe(REAL_ORIGIN);
  });
});
