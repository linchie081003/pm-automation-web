import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";
import { formatProjectPhase } from "../lib/projectPhase";

export default function HomePage() {
  const [summary, setSummary] = useState<{ total: number; by_phase: Record<string, number> } | null>(
    null,
  );
  const [reminders, setReminders] = useState<
    { project_code: string; message: string; severity: string }[]
  >([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    api<{ total: number; by_phase: Record<string, number> }>("/dashboard/summary")
      .then(setSummary)
      .catch((e) => setErr(getErrorMessage(e)));
    api<typeof reminders>("/dashboard/reminders")
      .then(setReminders)
      .catch(() => {});
  }, []);

  return (
    <>
      <h1 className="page-title">Dashboard Operasional</h1>
      <p className="text-muted page-lead">
        Proyek sedang berjalan (Kick Off ke atas). Fase SPH tidak ditampilkan di sini.
      </p>
      {err && <div className="alert alert--error">{err}</div>}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Proyek aktif</div>
          <div className="kpi-value">{summary?.total ?? "—"}</div>
        </div>
      </div>
      {summary && (
        <div className="card">
          <h2 className="card-title">Per fase</h2>
          {Object.keys(summary.by_phase).length === 0 ? (
            <p className="text-muted">
              Belum ada proyek aktif di dashboard. Proyek baru di fase SPH muncul setelah lanjut
              ke Kick Off — kelola di <Link to="/projects">Daftar proyek</Link>.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fase</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.by_phase).map(([phase, n]) => (
                  <tr key={phase}>
                    <td>
                      <span className="badge badge-indigo badge-phase">
                        {formatProjectPhase(phase)}
                      </span>
                    </td>
                    <td>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {reminders.length > 0 && (
        <div className="card">
          <h2 className="card-title">Reminder PM</h2>
          <ul className="plain">
            {reminders.slice(0, 15).map((r, i) => (
              <li key={i}>
                <strong>{r.project_code}</strong>: {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
