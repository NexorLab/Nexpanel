import { describe, expect, it } from "vitest";
import { isValidHost } from "../src/domain/hosts";

describe("isValidHost", () => {
  it("accepts plain hostnames and punycode-free IDN labels", () => {
    expect(isValidHost("example.com")).toBe(true);
    expect(isValidHost("nexpanel-panel.nexpanelpro.workers.dev")).toBe(true);
    expect(isValidHost("a.b.c.d.example.co.uk")).toBe(true);
    expect(isValidHost("localhost")).toBe(false); // single label, not an IP
    expect(isValidHost("sub-domain.example.com")).toBe(true);
  });

  it("accepts IPv4 and IPv6 addresses", () => {
    expect(isValidHost("127.0.0.1")).toBe(true);
    expect(isValidHost("8.8.8.8")).toBe(true);
    expect(isValidHost("::1")).toBe(true);
    expect(isValidHost("[::1]")).toBe(true);
    expect(isValidHost("2001:4860:4860::8888")).toBe(true);
  });

  // v2rayNG splits the URI on the FIRST "://", so "https://a.com" in the
  // authority makes it read the scheme as the address and leaves the port
  // empty — exactly the "no address, no port" symptom this guard exists for.
  it("rejects a scheme or path", () => {
    expect(isValidHost("https://nexpanel-panel.nexpanelpro.workers.dev")).toBe(false);
    expect(isValidHost("http://example.com")).toBe(false);
    expect(isValidHost("example.com/ws")).toBe(false);
    expect(isValidHost("example.com/")).toBe(false);
    expect(isValidHost("//example.com")).toBe(false);
  });

  it("rejects a trailing dot, empty input and overlong hosts", () => {
    expect(isValidHost("")).toBe(false);
    expect(isValidHost("example.com.")).toBe(false);
    expect(isValidHost("a".repeat(64) + ".example.com")).toBe(false); // label > 63
    expect(isValidHost(`${"a".repeat(50)}.com`)).toBe(true);
  });
});
