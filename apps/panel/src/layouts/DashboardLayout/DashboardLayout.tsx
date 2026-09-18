import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  Server,
  FileText,
  Network,
  LogOut,
  Moon,
  Sun,
  Languages,
  Menu,
  Zap,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import "./DashboardLayout.css";

const NAV_ITEMS = [
  { to: "/", titleKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/users", titleKey: "nav.users", icon: Users },
  { to: "/configs", titleKey: "nav.configs", icon: FileText },
  { to: "/backends", titleKey: "nav.backends", icon: Server },
  { to: "/subscriptions", titleKey: "nav.subscriptions", icon: Network },
  { to: "/settings", titleKey: "nav.settings", icon: Settings },
] as const;

export default function DashboardLayout() {
  const { admin, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Route title comes from the leaf route's handle (titleKey). useMatches()
  // requires a data router; with declarative <Routes> the title must be
  // derived from the current pathname instead.
  const title = useMemo(() => {
    const item = [...NAV_ITEMS]
      .sort((a, b) => b.to.length - a.to.length)
      .find(({ to }) => to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));
    return item ? t(item.titleKey) : t("nav.dashboard");
  }, [location.pathname, t]);

  const roleKey = admin ? `settings.admins.role.${admin.role}` : "";

  return (
    <div className="dashboard-layout">
      <div
        className={`sidebar-overlay${sidebarOpen ? " visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">
            <Zap size={19} strokeWidth={2.4} />
          </div>
          <h2>NexPanel</h2>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, titleKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon size={18} />
              <span>{t(titleKey)}</span>
            </NavLink>
          ))}
        </nav>

        {admin && (
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {admin.username.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{admin.username}</div>
                <div className="sidebar-user-role">{t(roleKey)}</div>
              </div>
            </div>

            <button
              type="button"
              className="sidebar-logout"
              onClick={() => logout()}
            >
              <LogOut size={18} />
              <span>{t("common.logout")}</span>
            </button>
          </div>
        )}
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="topbar-icon-button topbar-mobile-toggle"
            aria-label={t("common.actions") || "Menu"}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <Menu size={20} />
          </button>

          <h1 className="topbar-title">{title}</h1>

          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-icon-button"
              aria-label={t("common.language")}
              onClick={() => setLang(lang === "en" ? "fa" : "en")}
            >
              <Languages size={19} />
            </button>

            <button
              type="button"
              className="topbar-icon-button"
              aria-label={t("common.theme")}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? (
                <Sun size={19} />
              ) : (
                <Moon size={19} />
              )}
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
