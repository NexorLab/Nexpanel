import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import "./DashboardLayout.css";
import {
  LayoutDashboard,
  Users,
  Settings,
  Server,
  FileText,
  Network,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>NexPanel</h2>
        </div>

        <nav className="sidebar-nav">
  <NavLink
  to="/"
  className={({ isActive }) => (isActive ? "active" : "")}
>
  <LayoutDashboard size={18} />
  <span>Dashboard</span>
</NavLink>

  <NavLink
  to="/users"
  className={({ isActive }) => (isActive ? "active" : "")}
>
  <Users size={18} />
  <span>Users</span>
</NavLink>

  <NavLink to="/configs">
    <FileText size={18} />
    <span>Configs</span>
  </NavLink>

  <NavLink
  to="/backends"
  className={({ isActive }) => (isActive ? "active" : "")}
>
  <Server size={18} />
  <span>Backends</span>
</NavLink>

  <NavLink
  to="/subscriptions"
  className={({ isActive }) => (isActive ? "active" : "")}
>
  <Network size={18} />
  <span>Subscriptions</span>
</NavLink>

  <NavLink
  to="/settings"
  className={({ isActive }) => (isActive ? "active" : "")}
>
  <Settings size={18} />
  <span>Settings</span>
</NavLink>

</nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <h1>Dashboard</h1>

          <div className="system-status">
            <span className="status-dot" />
            Online
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}