import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { api, getErrorMessage } from "../api";

import { useAuth } from "../auth";
import { formatDisplayDate } from "../lib/formatDate";
import { formatDeviationPct, deviationFromTargetActual } from "../lib/progressFormat";
import { filterProjectsBySearch } from "../lib/projectListFilter";
import { formatProjectPhase } from "../lib/projectPhase";

type Project = {
  id: number;
  code: string;
  name: string;
  client_name: string;
  current_phase: string;
  po_due_date: string | null;
  po_sub_total: number | null;
  contract_value: number | null;
  sph_total_rupiah: number | null;
  planned_progress_pct?: number | null;
  actual_progress_pct?: number | null;
  progress_deviation_pct?: number | null;
  spi?: number | null;
  rag_overall?: string | null;
  status_date?: string | null;
  sph_no?: string | null;
  project_manager?: string | null;
};

type ProjectCreated = Project & { owner_id: number };

function formatRp(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function projectDeviation(p: Project): number | null {
  return (
    p.progress_deviation_pct ??
    deviationFromTargetActual(p.planned_progress_pct, p.actual_progress_pct)
  );
}

export default function ProjectsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canWrite = can("projects.write");

  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [error, setError] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [sphNo, setSphNo] = useState("");
  const [sphName, setSphName] = useState("");
  const [sphClient, setSphClient] = useState("");
  const [projectManager, setProjectManager] = useState("");
  const [poDate, setPoDate] = useState("");
  const [search, setSearch] = useState("");

  const visibleProjects = useMemo(
    () => filterProjectsBySearch(projects, search),
    [projects, search],
  );

  const load = useCallback(async () => {
    const list = await api<Project[]>("/projects");
    setProjects(list);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  useEffect(() => {
    if (showNewForm && canWrite) {
      api<{ code: string }>("/projects/next-code")
        .then((r) => setGeneratedCode(r.code))
        .catch(() => setGeneratedCode(""));
    }
  }, [showNewForm, canWrite]);

  const deleteProject = async (p: Project) => {
    if (
      !window.confirm(
        `Hapus proyek ${p.code} (${p.name})? Hanya diizinkan sebelum delivery.`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await api(`/projects/${p.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const payload: Record<string, unknown> = {
        sph_name: sphName.trim(),
        sph_client: sphClient.trim(),
        sph_no: sphNo.trim() || undefined,
        project_manager: projectManager.trim() || undefined,
      };
      if (poDate) payload.po_date = poDate;
      const created = await api<ProjectCreated>("/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSphNo("");
      setSphName("");
      setSphClient("");
      setProjectManager("");
      setPoDate("");
      await load();
      setShowNewForm(false);
      navigate(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat proyek");
    }
  };

  return (
    <div className="project-list-page">
      <header className="project-list-page__head">
        <div>
          <h1 className="page-title">Daftar proyek</h1>
          <p className="project-list-page__lead text-muted">
            Ringkasan delivery — progress dan kesehatan proyek pada status date terakhir.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="primary"
            onClick={() => setShowNewForm((v) => !v)}
          >
            {showNewForm ? "Tutup form" : "Proyek baru"}
          </button>
        )}
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      {canWrite && showNewForm && (
        <div className="card new-project-card">
          <div className="new-project-card__head">
            <h2 className="card-title">Proyek baru</h2>
            <p className="text-muted new-project-card__lead">
              Kode proyek digenerate otomatis. Nama proyek mengikuti SPH Name; detail PO dan nilai
              kontrak dapat dilengkapi setelah proyek dibuat.
            </p>
          </div>
          <form onSubmit={onCreate} className="new-project-form">
            <div className="new-project-form__grid">
              <div className="form-row">
                <label>Kode proyek (sistem)</label>
                <input value={generatedCode} readOnly className="input-readonly" />
              </div>
              <div className="form-row">
                <label htmlFor="new-sph-no">SPH No.</label>
                <input
                  id="new-sph-no"
                  value={sphNo}
                  onChange={(e) => setSphNo(e.target.value)}
                  placeholder="Contoh: SPH-2026-001"
                />
              </div>
              <div className="form-row new-project-form__span2">
                <label htmlFor="sph-name">SPH name / Nama proyek</label>
                <input
                  id="sph-name"
                  value={sphName}
                  onChange={(e) => setSphName(e.target.value)}
                  required
                  placeholder="Nama delivery / judul SPH"
                />
              </div>
              <div className="form-row">
                <label htmlFor="sph-client">SPH klien</label>
                <input
                  id="sph-client"
                  value={sphClient}
                  onChange={(e) => setSphClient(e.target.value)}
                  placeholder="Nama klien"
                />
              </div>
              <div className="form-row">
                <label htmlFor="project-manager">Project Manager</label>
                <input
                  id="project-manager"
                  value={projectManager}
                  onChange={(e) => setProjectManager(e.target.value)}
                  placeholder="Nama PM penanggung jawab"
                />
              </div>
              <div className="form-row">
                <label htmlFor="project-po-date">Tanggal PO (opsional)</label>
                <input
                  id="project-po-date"
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-muted form-hint">
              Subtotal PO mengisi nilai kontrak otomatis setelah tab PO disimpan.
            </p>
            <div className="new-project-form__actions">
              <button type="submit" className="primary">
                Buat proyek
              </button>
              <button type="button" onClick={() => setShowNewForm(false)}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="card project-list-card" aria-label="Tabel proyek">
        <div className="project-list-card__toolbar">
          <p className="project-list-card__count">
            <strong>{visibleProjects.length}</strong>
            <span className="text-muted">
              {projects.length === visibleProjects.length
                ? " proyek"
                : ` dari ${projects.length} proyek`}
            </span>
          </p>
          <div className="project-list-card__search">
            <label htmlFor="project-list-search" className="visually-hidden">
              Cari proyek
            </label>
            <input
              id="project-list-search"
              type="search"
              className="project-list-card__search-input"
              placeholder="Cari kode, nama, klien, PM…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {projects.length === 0 ? (
          <p className="project-list-card__empty">
            Belum ada proyek.
            {canWrite
              ? ' Klik "Proyek baru" untuk menambahkan proyek.'
              : " Hubungi PM atau admin untuk membuat proyek."}
          </p>
        ) : visibleProjects.length === 0 ? (
          <p className="project-list-card__empty text-muted">
            Tidak ada proyek yang cocok dengan pencarian.
          </p>
        ) : (
          <div className="table-scroll project-list-card__scroll">
            <table className="data-table data-table--projects">
              <thead>
                <tr>
                  <th scope="col">Proyek</th>
                  <th scope="col">Klien</th>
                  <th scope="col">PM</th>
                  <th scope="col">PO due</th>
                  <th scope="col" className="num">
                    Nilai SPH
                  </th>
                  <th scope="col">Fase</th>
                  <th scope="col">Status date</th>
                  <th scope="col" className="num">
                    Target
                  </th>
                  <th scope="col" className="num">
                    Actual
                  </th>
                  <th scope="col" className="num">
                    Deviasi
                  </th>
                  <th scope="col" className="num">
                    SPI
                  </th>
                  <th scope="col" className="rag-col">
                    RAG
                  </th>
                  {canWrite && <th scope="col" className="project-list-col-actions" />}
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((p) => {
                  const dev = projectDeviation(p);
                  const devNegative = dev != null && dev < 0;
                  return (
                    <tr key={p.id}>
                      <td className="project-list-cell-proyek">
                        <Link to={`/projects/${p.id}`} className="project-list-code">
                          {p.code}
                        </Link>
                        <span className="project-list-name" title={p.name}>
                          {p.name}
                        </span>
                      </td>
                      <td className="project-list-cell-muted">{p.client_name || "—"}</td>
                      <td className="project-list-cell-muted">{p.project_manager || "—"}</td>
                      <td className="project-list-cell-date">
                        {formatDisplayDate(p.po_due_date)}
                      </td>
                      <td className="num project-list-cell-money">{formatRp(p.sph_total_rupiah)}</td>
                      <td>
                        <span className="badge badge-indigo badge-phase">
                          {formatProjectPhase(p.current_phase)}
                        </span>
                      </td>
                      <td className="project-list-cell-date">
                        {formatDisplayDate(p.status_date ?? null)}
                      </td>
                      <td className="num project-list-metric">
                        {p.planned_progress_pct != null
                          ? `${Number(p.planned_progress_pct).toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="num project-list-metric">
                        {p.actual_progress_pct != null
                          ? `${Number(p.actual_progress_pct).toFixed(2)}%`
                          : "—"}
                      </td>
                      <td
                        className={`num project-list-metric${devNegative ? " project-list-metric--down" : ""}`}
                      >
                        {formatDeviationPct(dev)}
                      </td>
                      <td className="num project-list-metric project-list-metric--spi">
                        {p.spi != null ? Number(p.spi).toFixed(4) : "—"}
                      </td>
                      <td className="rag-col">
                        {p.rag_overall ? (
                          <span className={`rag rag-${p.rag_overall}`}>{p.rag_overall}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      {canWrite && (
                        <td className="project-list-col-actions">
                          <button
                            type="button"
                            className="danger-link"
                            onClick={() => deleteProject(p)}
                          >
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
