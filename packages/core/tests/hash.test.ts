import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/crypto/hash";

describe("sha256Hex", () => {
  it("matches the known SHA-256 digests", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic", async () => {
    const first = await sha256Hex("nexpanel-session-token");
    const second = await sha256Hex("nexpanel-session-token");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});
