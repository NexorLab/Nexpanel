
const ENCRYPTED_PREFIX = "enc:v1:";
const KEY_HEX_LENGTH = 64;
const IV_LENGTH = 12;
export function validateBackendEncryptionKey(keyHex: string): void {
  if (
    typeof keyHex !== "string" ||
    keyHex.length !== KEY_HEX_LENGTH
  ) {
    throw new Error(
      "BACKEND_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.",
    );
  }

  hexToBytes(keyHex);
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hexadecimal value.");
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function importEncryptionKey(keyHex: string): Promise<CryptoKey> {
  validateBackendEncryptionKey(keyHex);
  const keyBytes = hexToBytes(keyHex);

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackendSecret(
  value: string | null | undefined,
  keyHex: string,
): Promise<string | null | undefined> {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  if (value.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error("Refusing to encrypt an already encrypted backend secret.");
  }

  const key = await importEncryptionKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(value);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return `${ENCRYPTED_PREFIX}${bytesToHex(combined)}`;
}

export async function decryptBackendSecret(
  value: string | null | undefined,
  keyHex: string,
): Promise<string | null | undefined> {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  // Existing plaintext rows remain readable during migration.
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const payload = hexToBytes(value.slice(ENCRYPTED_PREFIX.length));

  if (payload.length <= IV_LENGTH) {
    throw new Error("Invalid encrypted backend secret.");
  }

  const iv = payload.slice(0, IV_LENGTH);
  const ciphertext = payload.slice(IV_LENGTH);
  const key = await importEncryptionKey(keyHex);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}
