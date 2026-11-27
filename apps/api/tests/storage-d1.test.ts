import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { createRepositories } from "../src/storage/d1";

describe("D1 repository initialization", () => {
  it("rejects a missing encryption key", () => {
    expect(() =>
      createRepositories({} as Env),
    ).toThrow("BACKEND_ENCRYPTION_KEY");
  });

  it("rejects an invalid encryption key", () => {
    expect(() =>
      createRepositories({
        BACKEND_ENCRYPTION_KEY: "invalid-key",
      } as Env),
    ).toThrow("BACKEND_ENCRYPTION_KEY");
  });
});