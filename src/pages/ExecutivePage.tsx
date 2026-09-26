import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";
import { formatDisplayDate } from "../lib/formatDate";
import { formatDeviationPct, deviationFromTargetActual } from "../lib/progressFormat";
import { filterProjectsBySearch } from "../lib/projectListFilter";
import { formatProjectPhase } from "../lib/projectPhase";
import { RequirePerm } from "../auth";

type Row = {
  id: number;
  code: string;
  name: string;
  client_name: string;
  current_phase: string;
  status_date?: string | null;
  spi: number | null;
  rag_overall: string | null;
  actual_progress_pct: number | null;
  planned_progress_pct: number | null;
  progress_deviation_pct?: number | null;
  sph_total_rupiah: number | null;
  planned_md: number | null;
  sph_no?: string | null;
  project_manager?: string | null;
};

function formatRp(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ExecutivePage() {
  const [bucket, setBucket] = useState<"running" | "completed">("running");
  const [data, setData] = useState<{
    count: number;
    avg_spi: number | null;
    rag_distribution: Record<string, number>;
    projects: Row[];
  } | null>(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  const visibleProjects = useMemo(
    () => filterProjectsBySearch(data?.projects ?? [], search),
    [data?.projects, search],
  );

  useEffect(() => {
    setErr("");
    api<typeof data>(`/dashboard/executive?bucket=${bucket}`)
      .then(setData)
      .catch((e) => {
        setErr(getErrorMessage(e));
        setData(null);
      });
  }, [bucket]);

  return (
    <RequirePerm perm="dashboard.executive">
      <h1 className="page-title">Dashboard Executive</h1>
      {err && <p className="error">{err}</p>}
      <div className="btn-group">
        <button
          type="button"
          className={bucket === "running" ? "primary" : ""}
          onClick={() => setBucket("running")}
        >
          Sedang berjalan
        </button>
        <button
          type="button"
          className={bucket === "completed" ? "primary" : ""}
          onClick={() => setBucket("completed")}
        >
          Completed
        </button>
      </div>
      {data && data.count === 0 && (
        <p className="text-muted">Tidak ada proyek pada bucket ini.</p>
      )}
      {data && data.count > 0 && (
        <>
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Proyek</div>
              <div className="kpi-value">{data.count}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Rata-rata SPI</div>
              <div className="kpi-value">
                {data.avg_spi != null ? data.avg_spi : "—"}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">RAG distribution</div>
              <p className="text-muted" style={{ margin: "0.5rem 0 0" }}>
                <span className="rag rag-green">green {data.rag_distribution.green ?? 0}</span>{" "}
                <span className="rag rag-yellow">yellow {data.rag_distribution.yellow ?? 0}</span>{" "}
                <span className="rag rag-red">red {data.rag_distribution.red ?? 0}</span>
              </p>
            </div>
          </div>
          <div className="list-search-bar">
            <label htmlFor="exec-list-search" className="list-search-bar__label">
              Cari proyek
            </label>
            <input
              id="exec-list-search"
              type="search"
              placeholder="Kode, nama, klien, PM, SPH No…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search.trim() ? (
              <span className="list-search-bar__hint text-muted">
                {visibleProjects.length} dari {data.projects.length} proyek
              </span>
            ) : null}
          </div>
          <div className="card">
            {visibleProjects.length === 0 ? (
              <p className="text-muted">Tidak ada proyek yang cocok dengan pencarian.</p>
            ) : (
            <table>
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama</th>
                  <th>PM</th>
                  <th>SPH No.</th>
                  <th>Fase</th>
                  <th>Status date</th>
                  <th>Target %</th>
                  <th>Actual %</th>
                  <th>Deviasi %</th>
                  <th>SPI</th>
                  <th>Nilai SPH</th>
                  <th>Est. MD</th>
                  <th>RAG</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/projects/${p.id}`}>{p.code}</Link>
                    </td>
                    <td>{p.name}</td>
                    <td>{p.project_manager || "—"}</td>
                    <td>{p.sph_no || "—"}</td>
                    <td>
                      <span className="badge badge-indigo badge-phase">
                        {formatProjectPhase(p.current_phase)}
                      </span>
                    </td>
                    <td>{formatDisplayDate(p.status_date ?? null)}</td>
                    <td>{p.planned_progress_pct != null ? `${p.planned_progress_pct}%` : "—"}</td>
                    <td>{p.actual_progress_pct != null ? `${p.actual_progress_pct}%` : "—"}</td>
                    <td>
                      {formatDeviationPct(
                        p.progress_deviation_pct ??
                          deviationFromTargetActual(
                            p.planned_progress_pct,
                            p.actual_progress_pct,
                          ),
                      )}
                    </td>
                    <td>{p.spi != null ? p.spi : "—"}</td>
                    <td>{formatRp(p.sph_total_rupiah)}</td>
                    <td>{p.planned_md ?? "—"}</td>
                    <td>
                      {p.rag_overall ? (
                        <span className={`rag rag-${p.rag_overall}`}>{p.rag_overall}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </>
      )}
    </RequirePerm>
  );
}
