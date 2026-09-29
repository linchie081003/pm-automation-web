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



function userInitials(name: string | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Shell({ children }: { children: React.ReactNode }) {

  const { user, logout, can } = useAuth();

  const loc = useLocation();

  const configActive = loc.pathname.startsWith("/config");

  const showConfig =

    can("users.read") ||
    can("roles.read") ||
    can("health.config.write") ||
    can("projects.write") ||
    can("integrations.clickup.configure") ||
    can("integrations.google_drive.configure");

  return (

    <div className="layout">

      <aside className="sidebar">

        <div className="sidebar-brand-block">
          <p className="sidebar-brand-title">Project Delivery</p>
          <p className="sidebar-brand-title sidebar-brand-title--accent">Control System</p>
        </div>

        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar" aria-hidden>
            {userInitials(user?.name)}
          </div>
          <div className="sidebar-user-meta">
            <p className="sidebar-user-name">{user?.name ?? "Pengguna"}</p>
            <p className="sidebar-user-caption">Signed in</p>
          </div>
        </div>

        <nav className="sidebar-nav">

          <Link className={loc.pathname === "/" ? "active" : ""} to="/">

            Dashboard

          </Link>

          <Link className={loc.pathname.startsWith("/projects") ? "active" : ""} to="/projects">

            Proyek

          </Link>

          {can("approvals.decide") && (

            <Link className={loc.pathname === "/approvals" ? "active" : ""} to="/approvals">

              Approval

            </Link>

          )}

          {can("rebaseline.approve") && (

            <Link
              className={loc.pathname === "/rebaseline-approvals" ? "active" : ""}
              to="/rebaseline-approvals"
            >
              Rebaseline
            </Link>

          )}

          {showConfig && (

            <Link className={configActive ? "active" : ""} to="/config">

              Setting

            </Link>

          )}

        </nav>

        <button type="button" className="btn-logout" onClick={logout}>

          Logout

        </button>

      </aside>

      <main className="main">
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

                <Route path="/approvals" element={<ApprovalsPage />} />

                <Route path="/rebaseline-approvals" element={<RebaselineApprovalsPage />} />

                <Route path="/config" element={<ConfigHubPage />} />
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


