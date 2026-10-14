import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABEL } from "../lib/defaults";
import type { Role } from "../types";

const NAV: Record<Exclude<Role, "pending">, Array<{ to: string; label: string }>> = {
  admin: [
    { to: "/admin/users", label: "帳號" },
    { to: "/admin/bots", label: "機械人" },
  ],
  teacher: [{ to: "/teacher", label: "我的機械人" }],
  student: [{ to: "/student", label: "我的機械人" }],
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, role, signOutUser } = useAuth();
  const links = role && role !== "pending" ? NAV[role] : [];

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          SciChatbot
        </Link>
        <nav className="nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <span>{profile?.displayName || "使用者"}</span>
          {role ? <span className="role-chip">{ROLE_LABEL[role]}</span> : null}
          <button type="button" className="button ghost" onClick={() => void signOutUser()}>
            登出
          </button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="center-screen">
      <p className="muted">正在確認登入狀態…</p>
    </div>
  );
}
