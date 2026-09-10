/**
 * Minimal JWT HS256 sign/verify using WebCrypto — Workers and Node ≥ 18.
 * Deliberately dependency-free: no JOSE library, no Node crypto module.
 */

export interface JwtClaims {
  /** Subject = admin id. */
  sub: string;
  /** Role claim — read by requireRole middleware. */
  role: "owner" | "admin" | "viewer";
  /** Issued at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function jsonToBase64Url(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(
  claims: Omit<JwtClaims, "iat" | "exp"> & { ttlSeconds?: number },
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSeconds ?? 24 * 3600;
  const payload: JwtClaims = {
    sub: claims.sub,
    role: claims.role,
    iat: now,
    exp: now + ttl,
  };
  const header = jsonToBase64Url({ alg: "HS256", typ: "JWT" });
  const body = jsonToBase64Url(payload);
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${toBase64Url(signature)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature) as BufferSource,
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as JwtClaims;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
