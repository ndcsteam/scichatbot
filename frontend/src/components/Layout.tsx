import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CloseIcon, FlaskIcon, LogoutIcon, MenuIcon } from "./Icons";
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

export function Layout({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const { profile, role, signOutUser } = useAuth();
  const links = role && role !== "pending" ? NAV[role] : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className={wide ? "shell fixed" : "shell"}>
      <header className={menuOpen ? "topbar open" : "topbar"}>
        <Link to="/" className="brand">
          <span className="brand-mark">
            <FlaskIcon size={19} />
          </span>
          SciChatbot
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="topbar-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          {menuOpen ? "收起" : "選單"}
        </button>
        <div id="topbar-menu" className="topbar-menu">
          <nav className="nav">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="who">
            <span className="avatar user" aria-hidden="true">
              {initialOf(profile?.displayName || profile?.email)}
            </span>
            <span className="who-name">{profile?.displayName || "使用者"}</span>
            {role ? <span className="role-chip">{ROLE_LABEL[role]}</span> : null}
            <button type="button" className="button ghost small" onClick={() => void signOutUser()}>
              <LogoutIcon size={16} />
              登出
            </button>
          </div>
        </div>
      </header>
      <main className={wide ? "main wide" : "main"}>{children}</main>
    </div>
  );
}

function initialOf(name?: string | null): string {
  const first = Array.from((name ?? "").trim())[0];
  return first ? first.toUpperCase() : "?";
}

export function LoadingScreen() {
  return (
    <div className="center-screen">
      <div className="login-status">
        <div className="spinner" aria-hidden="true" />
        <p className="muted">正在確認登入狀態…</p>
      </div>
    </div>
  );
}
