export const API_BASE = "http://localhost:5000";

const TOKEN_KEY = "familis.token";
const USER_KEY = "familis.user";
const CURRENT_SESSION_KEY = "familis.currentSession";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage failures */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function clearSessionAndRedirect(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(CURRENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
  if (window.location.pathname !== "/") {
    window.location.assign("/");
  }
}

/**
 * fetch wrapper that targets the Express API, attaches the bearer token, and
 * forces re-login on 401. Pass an API path (e.g. "/api/foods"); FormData bodies
 * are passed through untouched so the browser sets the multipart boundary.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearSessionAndRedirect();
  }
  return res;
}
