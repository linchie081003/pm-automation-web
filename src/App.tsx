import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { RequireAuth, RequirePerm, useAuth } from "./auth";

import LoginPage from "./pages/LoginPage";

import UsersPage from "./pages/UsersPage";

import RolesPage from "./pages/RolesPage";

import ProjectsPage from "./pages/ProjectsPage";

import ProjectDetailPage from "./pages/ProjectDetailPage";

import DashboardPage from "./pages/DashboardPage";
import ExecutivePage from "./pages/ExecutivePage";

import ApprovalsPage from "./pages/ApprovalsPage";
import RebaselineApprovalsPage from "./pages/RebaselineApprovalsPage";

import ConfigHubPage from "./pages/ConfigHubPage";

import TimelineTemplatesPage from "./pages/TimelineTemplatesPage";
import WorkCalendarPage from "./pages/WorkCalendarPage";
import ClickUpIntegrationPage from "./pages/ClickUpIntegrationPage";
import GoogleDriveIntegrationPage from "./pages/GoogleDriveIntegrationPage";
import ClickUpStatusMappingPage from "./pages/ClickUpStatusMappingPage";
import { GlobalProgressBar } from "./components/GlobalProgressBar";
import { RequirePermRoute } from "./components/RequirePermRoute";
import { readSidebarOpen, writeSidebarOpen } from "./lib/sidebarPref";
import { CONFIG_MENU_ANY_PERM, visibleMainNavItems } from "./lib/mainNav";



function userInitials(name: string | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Shell({ children }: { children: React.ReactNode }) {

  const { user, logout, loggingOut, can, refresh } = useAuth();

  const loc = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(() => readSidebarOpen(true));

  useEffect(() => {
    writeSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const navItems = visibleMainNavItems(can);

  return (

    <div className={`layout${sidebarOpen ? "" : " layout--sidebar-hidden"}`}>

      <aside className="sidebar" aria-hidden={!sidebarOpen}>

        <div className="sidebar-top-row">
          <div className="sidebar-brand-block">
            <p className="sidebar-brand-title">Project Delivery</p>
            <p className="sidebar-brand-title sidebar-brand-title--accent">Control System</p>
          </div>
          <button
            type="button"
            className="sidebar-menu-toggle"
            onClick={() => setSidebarOpen(false)}
            aria-label="Sembunyikan menu"
            title="Sembunyikan menu"
          >
            ‹
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Menu utama">
          {navItems.map((item) => (
            <Link
              key={item.to}
              className={item.isActive(loc.pathname) ? "active" : ""}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar" aria-hidden>
              {userInitials(user?.name)}
            </div>
            <div className="sidebar-user-meta">
              <p className="sidebar-user-name">{user?.name ?? "Pengguna"}</p>
              <p className="sidebar-user-caption">{user?.email ?? "Signed in"}</p>
            </div>
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={() => void logout()}
              disabled={loggingOut}
              aria-busy={loggingOut}
              title="Keluar dari akun (semua sesi)"
              aria-label={loggingOut ? "Sedang keluar" : "Keluar dari akun"}
            >
              <svg
                className="sidebar-logout-btn__icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className="sidebar-logout-btn__label">
                {loggingOut ? "…" : "Keluar"}
              </span>
            </button>
          </div>
        </div>

      </aside>

      <main className="main">
        {!sidebarOpen && (
          <button
            type="button"
            className="main-menu-open"
            onClick={() => setSidebarOpen(true)}
            aria-label="Tampilkan menu"
            title="Tampilkan menu"
          >
            ☰ Menu
          </button>
        )}
        <GlobalProgressBar />
        {children}
      </main>

    </div>

  );

}



export default function App() {

  return (

    <Routes>

      <Route path="/login" element={<LoginPage />} />

      <Route

        path="/*"

        element={

          <RequireAuth>

            <Shell>

              <Routes>

                <Route path="/" element={<DashboardPage />} />

                <Route path="/executive" element={<ExecutivePage />} />

                <Route path="/projects" element={<ProjectsPage />} />

                <Route path="/projects/:id" element={<ProjectDetailPage />} />

                <Route
                  path="/approvals"
                  element={
                    <RequirePermRoute anyPerm={["approvals.decide"]}>
                      <ApprovalsPage />
                    </RequirePermRoute>
                  }
                />

                <Route
                  path="/rebaseline-approvals"
                  element={
                    <RequirePermRoute anyPerm={["rebaseline.approve"]}>
                      <RebaselineApprovalsPage />
                    </RequirePermRoute>
                  }
                />

                <Route
                  path="/config"
                  element={
                    <RequirePermRoute anyPerm={[...CONFIG_MENU_ANY_PERM]}>
                      <ConfigHubPage />
                    </RequirePermRoute>
                  }
                />
                <Route path="/setting" element={<Navigate to="/config" replace />} />

                <Route path="/config/users" element={<UsersPage />} />

                <Route path="/config/roles" element={<RolesPage />} />

                <Route path="/config/timeline-templates" element={<TimelineTemplatesPage />} />
                <Route path="/config/work-calendar" element={<WorkCalendarPage />} />
                <Route path="/config/clickup" element={<ClickUpIntegrationPage />} />
                <Route path="/config/clickup-status" element={<ClickUpStatusMappingPage />} />
                <Route
                  path="/config/google-drive"
                  element={
                    <RequirePerm perm="integrations.google_drive.configure">
                      <GoogleDriveIntegrationPage />
                    </RequirePerm>
                  }
                />

                <Route path="/users" element={<Navigate to="/config/users" replace />} />

                <Route path="/roles" element={<Navigate to="/config/roles" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />

              </Routes>

            </Shell>

          </RequireAuth>

        }

      />

    </Routes>

  );

}


