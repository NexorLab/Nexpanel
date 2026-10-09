/**
 * Contract for errorCode: pages read machine codes off adapter errors.
 *
 * The real adapter carries the code in `code` and a sentence in `message`;
 * the mock carries the code in `message` because its error classes pass
 * the code straight to super(). Pages used to compare `error.message` to
 * a code, which only worked for the mock — every real conflict then fell
 * through to `errors.unknown`. errorCode must paper over that split.
 */
import { describe, expect, it } from "vitest";

import { errorCode } from "../src/lib/api/errors";
import { ApiError } from "../src/lib/api/real/http";

describe("errorCode", () => {
  it("reads the code off a real ApiError", () => {
    expect(errorCode(new ApiError("NAME_TAKEN", "Backend name is already taken.", 409))).toBe(
      "NAME_TAKEN",
    );
  });

  it("falls back to message for mock errors, whose message IS the code", () => {
    class ConflictError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ConflictError";
      }
    }
    expect(errorCode(new ConflictError("NAME_TAKEN"))).toBe("NAME_TAKEN");
  });

  it("ignores a real adapter's English sentence", () => {
    // A server sentence is never a machine code, so the message fallback
    // cannot misread one as a code.
    expect(errorCode(new Error("Backend name is already taken."))).toBeUndefined();
  });

  it("ignores anything that is not an Error", () => {
    expect(errorCode(undefined)).toBeUndefined();
    expect(errorCode("NAME_TAKEN")).toBeUndefined();
    expect(errorCode({ code: "NAME_TAKEN" })).toBeUndefined();
  });

  it("prefers code over message when both look like codes", () => {
    expect(errorCode(new ApiError("NAME_TAKEN", "USERNAME_TAKEN", 409))).toBe("NAME_TAKEN");
  });

  it("does not treat a lowercase string as a code", () => {
    expect(errorCode(new Error("name_taken"))).toBeUndefined();
  });
});
