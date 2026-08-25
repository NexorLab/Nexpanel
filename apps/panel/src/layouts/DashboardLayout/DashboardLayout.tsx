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
          <a href="/">
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </a>

          <a href="#">
            <Users size={18} />
            <span>Users</span>
          </a>

          <a href="#">
            <FileText size={18} />
            <span>Configs</span>
          </a>

          <a href="#">
            <Server size={18} />
            <span>Backends</span>
          </a>

          <a href="#">
            <Network size={18} />
            <span>Subscriptions</span>
          </a>

          <a href="#">
            <Settings size={18} />
            <span>Settings</span>
          </a>
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