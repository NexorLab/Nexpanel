import { describe, expect, it } from "vitest";
import { validateBackend } from "../src/domain/backend-validation";
import type { Backend } from "../src/domain/types";

function makeBackend(
  overrides: Partial<Pick<Backend, "security" | "fragment" | "ech">> = {},
): Pick<Backend, "security" | "fragment" | "ech"> {
  return {
    security: "tls",
    fragment: {
      mode: "none",
      packets: "tlshello",
      lengthMin: 1,
      lengthMax: 10,
      delayMin: 1,
      delayMax: 10,
      maxSplitMin: 0,
      maxSplitMax: 0,
    },
    ech: {
      enabled: false,
      serverName: "",
    },
    ...overrides,
  };
}

describe("validateBackend", () => {
  it("accepts a backend with Fragment and ECH disabled", () => {
    expect(validateBackend(makeBackend())).toBeNull();
  });

  it("accepts custom Fragment with TLS", () => {
    expect(
      validateBackend(
        makeBackend({
          fragment: {
            mode: "custom",
            packets: "tlshello",
            lengthMin: 1,
            lengthMax: 10,
            delayMin: 1,
            delayMax: 10,
            maxSplitMin: 0,
            maxSplitMax: 0,
          },
        }),
      ),
    ).toBeNull();
  });

  it("accepts custom Fragment with Reality", () => {
    expect(
      validateBackend(
        makeBackend({
          security: "reality",
          fragment: {
            mode: "custom",
            packets: "tlshello",
            lengthMin: 1,
            lengthMax: 10,
            delayMin: 1,
            delayMax: 10,
            maxSplitMin: 0,
            maxSplitMax: 0,
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects custom Fragment without security", () => {
    expect(
      validateBackend(
        makeBackend({
          security: "none",
          fragment: {
            mode: "custom",
            packets: "tlshello",
            lengthMin: 1,
            lengthMax: 10,
            delayMin: 1,
            delayMax: 10,
            maxSplitMin: 0,
            maxSplitMax: 0,
          },
        }),
      ),
    ).toEqual({
      code: "BACKEND_FRAGMENT_REQUIRES_TLS",
      message: "Fragment requires TLS or Reality security.",
    });
  });

  it("accepts enabled ECH with TLS and a server name", () => {
    expect(
      validateBackend(
        makeBackend({
          ech: { enabled: true, serverName: "example.com" },
        }),
      ),
    ).toBeNull();
  });

  it("rejects enabled ECH without TLS", () => {
    expect(
      validateBackend(
        makeBackend({
          security: "reality",
          ech: { enabled: true, serverName: "example.com" },
        }),
      ),
    ).toEqual({
      code: "BACKEND_ECH_REQUIRES_TLS",
      message: "ECH requires TLS security.",
    });
  });

  it("rejects enabled ECH with an empty server name", () => {
    expect(
      validateBackend(
        makeBackend({
          ech: { enabled: true, serverName: "  " },
        }),
      ),
    ).toEqual({
      code: "BACKEND_ECH_SERVER_NAME_REQUIRED",
      message: "ECH requires a server name.",
    });
  });

  it("allows Fragment and ECH together with TLS", () => {
    expect(
      validateBackend(
        makeBackend({
          fragment: {
            mode: "custom",
            packets: "tlshello",
            lengthMin: 1,
            lengthMax: 10,
            delayMin: 1,
            delayMax: 10,
            maxSplitMin: 0,
            maxSplitMax: 0,
          },
          ech: { enabled: true, serverName: "example.com" },
        }),
      ),
    ).toBeNull();
  });
});
