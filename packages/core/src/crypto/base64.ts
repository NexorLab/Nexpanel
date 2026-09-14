/**
 * UTF-8-safe base64 via Web-standard encoders only. Plain btoa throws
 * on any code point above U+00FF, and names/URIs here are user input
 * (backend names may be non-ASCII), so bytes go through TextEncoder
 * first. Identical behavior on Workers and Node ≥ 18.
 */

export function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
}

export function encodeBase64(text: string): string {
  return btoa(bytesToBinaryString(new TextEncoder().encode(text)));
}
