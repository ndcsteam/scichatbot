import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LoadingScreen } from "./Layout";
import type { Role } from "../types";

export function homePath(role: Role | null): string {
  switch (role) {
    case "admin":
      return "/admin/users";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    case "pending":
      return "/pending";
    default:
      return "/login";
  }
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { ready, user, role: current } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!current) return <LoadingScreen />;
  if (current === "pending") return <Navigate to="/pending" replace />;
  if (current !== role) return <Navigate to={homePath(current)} replace />;
  return children;
}
