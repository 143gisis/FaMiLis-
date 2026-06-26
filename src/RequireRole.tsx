import { Navigate, Outlet } from "react-router-dom";
import { getStoredRole, hasActiveSession, isAdminRole, type UserRole } from "./RequireAuth";

interface RequireRoleProps {
  allowed: UserRole[];
}

/**
 * Route guard that renders child routes only for the allowed roles. `staff` is
 * accepted wherever `admin` is allowed. Unauthorized roles are redirected to the
 * landing page for their own role rather than being shown a dead end.
 */
export default function RequireRole({ allowed }: RequireRoleProps) {
  const role = getStoredRole();
  if (!role) {
    return <Navigate to="/" replace />;
  }

  const permitted = allowed.includes(role) || (allowed.includes("admin") && role === "staff");
  if (permitted) {
    return <Outlet />;
  }

  if (isAdminRole(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  // Tester landing: continue an active session, otherwise the consent gate.
  return <Navigate to={hasActiveSession() ? "/session" : "/consent"} replace />;
}
