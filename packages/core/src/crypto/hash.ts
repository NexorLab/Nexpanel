/**
 * SHA-256 helper (lowercase hex). Used to key session rows by token —
 * the database never stores raw bearer tokens. WebCrypto-only so the
 * same code runs on Workers and Node ≥ 18.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
