/**
 * Read the stable machine code off an error thrown by either API adapter.
 *
 * The real adapter throws `ApiError`, which keeps the server's code in
 * `code` and the English sentence in `message`. The mock adapter throws
 * plain `Error`s whose message *is* the code (its ConflictError/AuthError
 * pass the code straight to super()). Pages must not compare
 * `error.message` to a machine code — that only holds for the mock and
 * silently degrades every real request to `errors.unknown`.
 */
export function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const apiError = error as Error & { code?: string };
  if (apiError.code) return apiError.code;
  // Mock path: the message is the code. A sentence from the real adapter
  // never matches, so this stays a mock-only fallback.
  return isCodeLike(apiError.message) ? apiError.message : undefined;
}

/** Machine codes are SCREAMING_SNAKE; a server sentence never is. */
function isCodeLike(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0 && /^[A-Z][A-Z0-9_]*$/.test(value);
}
