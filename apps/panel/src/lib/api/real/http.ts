/**
 * Fetch plumbing shared by the real HTTP adapter.
 *
 * The token is read from the same key AuthContext writes, so pages never
 * have to thread it through getApi(). A 401 clears it, which routes the
 * user back to /login via RequireAuth on the next render.
 */

export const TOKEN_KEY = "nexpanel.token";
const ADMIN_KEY = "nexpanel.admin";

const BASE_PATH = "/api/v1";

/** Only /auth/status, /auth/login and /auth/setup are public. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  `${BASE_PATH}/auth/status`,
  `${BASE_PATH}/auth/login`,
  `${BASE_PATH}/auth/setup`,
]);

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** Read the stored JWT without pulling AuthContext into the API layer. */
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Drop local credentials when the server rejects the token (expired,
 * revoked by a password change, or the admin was deactivated). Silent —
 * RequireAuth redirects on the next render.
 */
export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  } catch {
    // ignore
  }
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  if (!params) return `${BASE_PATH}${path}`;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${BASE_PATH}${path}?${query}` : `${BASE_PATH}${path}`;
}

/**
 * Perform a JSON request and return the parsed body, or throw an ApiError
 * carrying the server's stable error code.
 */
export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, unknown>;
    /** Allow a non-JSON (empty) success body. */
    empty?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", body, params, empty } = options;
  const url = buildUrl(path, params);
  const isPublic = PUBLIC_PATHS.has(`${BASE_PATH}${path}`);
  const token = readToken();

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!isPublic && token) {
    headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network failure / CORS / server down — the login page treats this
    // like any other failure and falls back to the login form.
    throw new ApiError("UNAVAILABLE", "Cannot reach the server.", 0);
  }

  if (!response.ok) {
    // 401 on an authenticated route means the session is gone.
    if (response.status === 401 && !isPublic) clearStoredAuth();

    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = payload?.error?.code ?? "INTERNAL";
    const message = payload?.error?.message ?? "Request failed.";
    throw new ApiError(code, message, response.status);
  }

  if (empty || response.status === 204) {
    return undefined as unknown as T;
  }
  return (await response.json()) as T;
}
