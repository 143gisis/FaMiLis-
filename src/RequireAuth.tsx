import { Navigate, Outlet, type NavigateFunction } from "react-router-dom";

export const FAMILIS_USER_KEY = "familis.user";
export const FAMILIS_CURRENT_SESSION_KEY = "familis.currentSession";
export const FAMILIS_TOKEN_KEY = "familis.token";

export type UserRole = "admin" | "staff" | "tester";

/** Removes only the booth session pointer (keeps auth for handoff flows). */
export function clearStoredSession(): void {
  try {
    localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Clears auth and navigates to login.
 * Pass `{ clearSession: true }` to also wipe the booth session pointer
 * (use only for full participant reset, e.g. tester auto-logout after survey).
 * Default keeps `familis.currentSession` so admin → tester handoff works
 * across the normal logout flow.
 */
export function performLogout(
  navigate: NavigateFunction,
  options?: { clearSession?: boolean },
) {
  try {
    localStorage.removeItem(FAMILIS_USER_KEY);
    localStorage.removeItem(FAMILIS_TOKEN_KEY);
    if (options?.clearSession === true) {
      localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
  navigate("/", { replace: true });
}

/** Reads the stored user role, or null when no valid user is present. */
export function getStoredRole(): UserRole | null {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as { role?: unknown };
    if (u?.role === "admin" || u?.role === "staff" || u?.role === "tester") {
      return u.role;
    }
    return null;
  } catch {
    return null;
  }
}

export function isAdminRole(role: UserRole | null): boolean {
  return role === "admin" || role === "staff";
}

/** True when an active session is stored locally (booth handoff to a tester). */
export function hasActiveSession(): boolean {
  try {
    const raw = localStorage.getItem(FAMILIS_CURRENT_SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as { id?: unknown };
    return s != null && (typeof s.id === "number" || typeof s.id === "string");
  } catch {
    return false;
  }
}

export function hasStoredUser(): boolean {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return false;
    const u = JSON.parse(raw) as { id?: unknown };
    return u != null && (typeof u.id === "number" || typeof u.id === "string");
  } catch {
    return false;
  }
}

/** Parent route: renders child routes only when a user session exists in localStorage. */
export default function RequireAuth() {
  if (!hasStoredUser()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
