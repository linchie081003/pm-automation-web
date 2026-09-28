import { Link } from "react-router-dom";
import { useAuth } from "../auth";

type HubItem = {
  to: string;
  title: string;
  desc: string;
  show: boolean;
};

export default function ConfigHubPage() {
  const { can } = useAuth();
  const items: HubItem[] = [
    {
      to: "/config/users",
      title: "Pengguna",
      desc: "Akun, role, dan akses tim.",
      show: can("users.read"),
    },
    {
      to: "/config/roles",
      title: "Role & permission",
      desc: "Hak akses modul dan aksi.",
      show: can("roles.read"),
    },
    {
      to: "/config/timeline-templates",
      title: "Template timeline",
      desc: "Master WBS per metodologi proyek.",
      show: can("health.config.write") || can("projects.write"),
    },
    {
      to: "/config/work-calendar",
      title: "Kalender kerja",
      desc: "Hari kerja organisasi dan libur nasional.",
      show: can("health.config.write") || can("projects.write"),
    },
    {
      to: "/config/clickup",
      title: "Integrasi ClickUp",
      desc: "Folder, list, dan sinkronisasi task.",
      show: can("integrations.clickup.configure"),
    },
    {
      to: "/config/clickup-status",
      title: "Status ClickUp → progress",
      desc: "Petakan custom status ke TODO / IN PROGRESS / DONE.",
      show: can("integrations.clickup.configure"),
    },
    {
      to: "/config/google-drive",
      title: "Integrasi Google Drive",
      desc: "Service account untuk salin upload dokumen ke folder proyek.",
      show: can("integrations.google_drive.configure"),
    },
  ].filter((i) => i.show);

  return (
    <>
      <h1 className="page-title">Setting</h1>
      <p className="text-muted" style={{ marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
        Konfigurasi master data dan integrasi untuk seluruh proyek.
      </p>
      <div className="config-hub-grid">
        {items.map((item) => (
          <Link key={item.to} to={item.to} className="config-hub-card">
            <span className="config-hub-card__title">{item.title}</span>
            <p className="config-hub-card__desc">{item.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
