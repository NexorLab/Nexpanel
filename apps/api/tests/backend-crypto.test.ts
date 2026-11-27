
import { describe, expect, it } from "vitest";
import {
  decryptBackendSecret,
  encryptBackendSecret,
  validateBackendEncryptionKey,
} from "../src/services/backend-crypto";

const TEST_KEY = "0123456789abcdef".repeat(4);
const WRONG_KEY = "abcdef0123456789".repeat(4);

describe("backend encryption key validation", () => {
  it("accepts a valid 64-character hexadecimal key", () => {
    expect(() => validateBackendEncryptionKey(TEST_KEY)).not.toThrow();
  });

  it("rejects a missing key", () => {
    expect(() =>
      validateBackendEncryptionKey(undefined as unknown as string),
    ).toThrow("BACKEND_ENCRYPTION_KEY");
  });

  it("rejects an invalid key length", () => {
    expect(() => validateBackendEncryptionKey("short-key"))
      .toThrow("BACKEND_ENCRYPTION_KEY");
  });

  it("rejects non-hexadecimal characters", () => {
    expect(() => validateBackendEncryptionKey("z".repeat(64)))
      .toThrow("Invalid hexadecimal value");
  });
});

describe("backend crypto", () => {
  it("encrypts and decrypts a backend secret", async () => {
    const plaintext = "sensitive-backend-credential";

    const encrypted = await encryptBackendSecret(plaintext, TEST_KEY);

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain(plaintext);
    await expect(decryptBackendSecret(encrypted, TEST_KEY)).resolves.toBe(plaintext);
  });

  it("uses a different random IV for each encryption", async () => {
    const first = await encryptBackendSecret("same-secret", TEST_KEY);
    const second = await encryptBackendSecret("same-secret", TEST_KEY);

    expect(first).not.toBe(second);
    await expect(decryptBackendSecret(first, TEST_KEY)).resolves.toBe("same-secret");
    await expect(decryptBackendSecret(second, TEST_KEY)).resolves.toBe("same-secret");
  });

  it("preserves null, undefined, and empty values", async () => {
    await expect(encryptBackendSecret(null, TEST_KEY)).resolves.toBeNull();
    await expect(encryptBackendSecret(undefined, TEST_KEY)).resolves.toBeUndefined();
    await expect(encryptBackendSecret("", TEST_KEY)).resolves.toBe("");

    await expect(decryptBackendSecret(null, TEST_KEY)).resolves.toBeNull();
    await expect(decryptBackendSecret(undefined, TEST_KEY)).resolves.toBeUndefined();
    await expect(decryptBackendSecret("", TEST_KEY)).resolves.toBe("");
  });

  it("keeps legacy plaintext values readable", async () => {
    await expect(decryptBackendSecret("legacy-uuid-value", TEST_KEY))
      .resolves.toBe("legacy-uuid-value");
  });

  it("rejects an invalid key length", async () => {
    await expect(encryptBackendSecret("secret", "short-key"))
      .rejects.toThrow("BACKEND_ENCRYPTION_KEY");
  });

  it("rejects non-hexadecimal keys", async () => {
    await expect(encryptBackendSecret("secret", "z".repeat(64)))
      .rejects.toThrow("Invalid hexadecimal value");
  });

  it("cannot decrypt with a different key", async () => {
    const encrypted = await encryptBackendSecret("secret", TEST_KEY);

    await expect(decryptBackendSecret(encrypted, WRONG_KEY)).rejects.toThrow();
  });

  it("rejects malformed encrypted payloads", async () => {
    await expect(decryptBackendSecret("enc:v1:abcd", TEST_KEY))
      .rejects.toThrow("Invalid encrypted backend secret");
  });

  it("refuses to encrypt an already encrypted value", async () => {
    await expect(encryptBackendSecret("enc:v1:already-encrypted", TEST_KEY))
      .rejects.toThrow("already encrypted");
  });
});
