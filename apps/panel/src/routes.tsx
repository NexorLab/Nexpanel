import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import RequireAuth from "./components/layout/RequireAuth";
import DashboardLayout from "./layouts/DashboardLayout/DashboardLayout";

const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const Users = lazy(() => import("./pages/Users/Users"));
const Configs = lazy(() => import("./pages/Configs/Configs"));
const Backends = lazy(() => import("./pages/Backends/Backends"));
const Subscriptions = lazy(() => import("./pages/Subscriptions/Subscriptions"));
const Settings = lazy(() => import("./pages/Settings/Settings"));
const Login = lazy(() => import("./pages/Login/Login"));
const NotFound = lazy(() => import("./pages/NotFound/NotFound"));

function PageFallback() {
  return (
    <div className="fade-in" style={{ padding: "var(--space-8)" }}>
      <div className="skeleton" style={{ height: 32, width: 220, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 120, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 240 }} />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<DashboardLayout />}>
            <Route
              index
              element={<Dashboard />}
              handle={{ titleKey: "nav.dashboard" }}
            />
            <Route
              path="users"
              element={<Users />}
              handle={{ titleKey: "nav.users" }}
            />
            <Route
              path="configs"
              element={<Configs />}
              handle={{ titleKey: "nav.configs" }}
            />
            <Route
              path="backends"
              element={<Backends />}
              handle={{ titleKey: "nav.backends" }}
            />
            <Route
              path="subscriptions"
              element={<Subscriptions />}
              handle={{ titleKey: "nav.subscriptions" }}
            />
            <Route
              path="settings"
              element={<Settings />}
              handle={{ titleKey: "nav.settings" }}
            />
          </Route>
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
