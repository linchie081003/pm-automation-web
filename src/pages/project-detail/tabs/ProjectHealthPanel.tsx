import { useEffect, useState } from "react";
import { api, downloadFile, getErrorMessage } from "../../../api";
import { formatDisplayDate, formatDisplayDateRange } from "../../../lib/formatDate";
import { SPI_HEALTH_LABEL, SPI_HEALTH_TITLE } from "../../../lib/spiLabels";
import type { ProjectDetail } from "../projectDetailTypes";
import { DELIVERY_PHASES } from "../projectPhaseAccess";
import { PHASE_NEXT_LABEL } from "../projectTabConfig";
import { TabAlert, TabPhaseFooter } from "../shared/TabLayout";
import { formatRupiah } from "../shared/moneyFormat";
export function ProjectHealthPanel({
  projectId,
  detail,
  gateRefreshKey,
  canAdvance,
  canEditPm,
  onAdvance,
  advanceBusy,
  msg,
  msgIsError,
  onProjectUpdated,
  canDelete,
  onDeleted,
}: {
  projectId: number;
  detail: ProjectDetail;
  gateRefreshKey: number;
  canAdvance: boolean;
  canEditPm?: boolean;
  onAdvance: () => void;
  advanceBusy?: boolean;
  msg: string;
  msgIsError: boolean;
  onProjectUpdated?: () => void;
  canDelete?: boolean;
  onDeleted?: () => void;
}) {
  const [editingPm, setEditingPm] = useState(false);
  const [pmDraft, setPmDraft] = useState("");
  const [pmBusy, setPmBusy] = useState(false);
  const [pmErr, setPmErr] = useState("");
  const [gate, setGate] = useState<{
    next_phase: string | null;
    can_advance: boolean;
    items: { id: string; label: string; ok: boolean }[];
  } | null>(null);
  const [gateLoading, setGateLoading] = useState(false);
  useEffect(() => {
    if (!canAdvance) {
      setGate(null);
      return;
    }
    let cancelled = false;
    setGateLoading(true);
    api<typeof gate>(`/projects/${projectId}/phase-gate`)
      .then((g) => {
        if (!cancelled) setGate(g);
      })
      .catch(() => {
        if (!cancelled) setGate(null);
      })
      .finally(() => {
        if (!cancelled) setGateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    canAdvance,
    detail.current_phase,
    detail.kickoff_timeline_confirmed_at,
    detail.health?.actual_progress_pct,
    gateRefreshKey,
  ]);
  const inDelivery = DELIVERY_PHASES.has(detail.current_phase);
  const startDate = detail.planned_start_date ?? detail.health.project_start_date ?? null;
  const endDate = detail.planned_end_date ?? detail.health.project_end_date ?? null;
  const rag = detail.health.rag_overall;
  const deleteProject = async () => {
    if (!window.confirm(`Hapus proyek ${detail.code} permanen?`)) return;
    try {
      await api(`/projects/${projectId}`, { method: "DELETE" });
      onDeleted?.();
    } catch (e) {
      alert(getErrorMessage(e));
    }
  };
  const target = detail.health.planned_progress_pct;
  const actual = detail.health.actual_progress_pct;
  const deviation =
    detail.health.progress_deviation_pct ??
    (target != null && actual != null ? Math.round((actual - target) * 100) / 100 : null);
  const statusDate =
    detail.health.status_date ?? detail.health.as_of ?? null;
  const spi = detail.health.spi;
  const greenMin = detail.health.config?.spi_green_min ?? 1;
  const yellowMin = detail.health.config?.spi_yellow_min ?? 0.9;
  const fmtPct = (v: number | null | undefined) =>
    v != null ? `${Number(v).toFixed(2)}%` : "—";
  const fmtSpi = (v: number | null | undefined) =>
    v != null ? Number(v).toFixed(4) : "—";

  const showDeckLink =
    detail.current_phase === "pre_kickoff" || detail.current_phase === "kickoff";
  const canShowDelete = canDelete && !DELIVERY_PHASES.has(detail.current_phase);
  const healthMetricsActive =
    inDelivery || Boolean(detail.kickoff_timeline_confirmed_at);

  return (
    <div className="card project-health-card">
      <div className="project-health-head">
        <h2 className="card-title">Kesehatan proyek</h2>
        {rag && (inDelivery || detail.kickoff_timeline_confirmed_at) && (
          <span className={`rag rag-${rag} project-health-rag-pill`}>{rag.toUpperCase()}</span>
        )}
      </div>

      <dl className="project-health-kpi">
        <div className="project-health-kpi-item">
          <dt>Start proyek</dt>
          <dd>{formatDisplayDate(startDate)}</dd>
        </div>
        <div className="project-health-kpi-item">
          <dt>End proyek</dt>
          <dd>{formatDisplayDate(endDate)}</dd>
        </div>
        <div className="project-health-kpi-item project-health-kpi-item--pm">
          <dt>Project Manager</dt>
          <dd>
            {editingPm && canEditPm ? (
              <div className="project-pm-edit">
                <input
                  type="text"
                  value={pmDraft}
                  maxLength={255}
                  placeholder="Nama PM"
                  onChange={(e) => setPmDraft(e.target.value)}
                  disabled={pmBusy}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={pmBusy}
                  onClick={async () => {
                    setPmErr("");
                    setPmBusy(true);
                    try {
                      await api(`/projects/${projectId}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          project_manager: pmDraft.trim() || null,
                        }),
                      });
                      setEditingPm(false);
                      onProjectUpdated?.();
                    } catch (e) {
                      setPmErr(getErrorMessage(e));
                    } finally {
                      setPmBusy(false);
                    }
                  }}
                >
                  Simpan
                </button>
                <button
                  type="button"
                  disabled={pmBusy}
                  onClick={() => {
                    setEditingPm(false);
                    setPmErr("");
                  }}
                >
                  Batal
                </button>
                {pmErr ? <span className="text-danger">{pmErr}</span> : null}
              </div>
            ) : (
              <span className="project-pm-display">
                {detail.project_manager?.trim() || "—"}
                {canEditPm ? (
                  <button
                    type="button"
                    className="project-pm-edit-btn"
                    onClick={() => {
                      setPmDraft(detail.project_manager?.trim() ?? "");
                      setPmErr("");
                      setEditingPm(true);
                    }}
                  >
                    Edit
                  </button>
                ) : null}
              </span>
            )}
          </dd>
        </div>
        <div className="project-health-kpi-item">
          <dt>SPH No.</dt>
          <dd>{detail.sph_no?.trim() || "—"}</dd>
        </div>
        <div className="project-health-kpi-item">
          <dt>Nilai SPH</dt>
          <dd>
            {detail.sph_total_rupiah != null ? formatRupiah(detail.sph_total_rupiah) : "—"}
          </dd>
        </div>
        <div className="project-health-kpi-item">
          <dt>Estimasi MD</dt>
          <dd>{detail.planned_md ?? "—"}</dd>
        </div>
      </dl>

      {healthMetricsActive && statusDate ? (
        <p className="project-health-as-of-note" role="note">
          Target, progress actual, deviasi, dan SPI dihitung s.d.{" "}
          <strong>{formatDisplayDate(statusDate)}</strong>{" "}
          <span className="project-health-as-of-note__tag">(as of today)</span>
          — tanggal proyek berjalan hari ini.
        </p>
      ) : null}

      <div className="project-health-table-wrap">
        <table className="data-table health-metrics-table">
          <thead>
            <tr>
              <th title="Tanggal penilaian (hari ini)">As of today</th>
              <th className="num">Target (%)</th>
              <th className="num">Progress actual (%)</th>
              <th className="num">Deviasi (%)</th>
              <th className="num" title={SPI_HEALTH_TITLE}>
                {SPI_HEALTH_LABEL}
              </th>
              <th className="rag-col">RAG</th>
            </tr>
          </thead>
          <tbody>
            <tr className={rag ? `health-row-rag-${rag}` : ""}>
              <td className="health-status-date">{formatDisplayDate(statusDate)}</td>
              <td className="num">{fmtPct(target)}</td>
              <td className="num">{fmtPct(actual)}</td>
              <td className="num">{fmtPct(deviation)}</td>
              <td className="num">{fmtSpi(spi)}</td>
              <td className="rag-col">
                {rag ? (
                  <span className={`rag rag-${rag}`}>{rag.toUpperCase()}</span>
                ) : (
                  <span className="text-muted health-rag-placeholder">—</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-muted health-metrics-hint">
        {!inDelivery && !detail.kickoff_timeline_confirmed_at ? (
          <>
            Metrik (SPI/RAG) aktif setelah timeline Kick Off dikonfirmasi.{" "}
            <span title={SPI_HEALTH_TITLE}>{SPI_HEALTH_LABEL}</span> = Actual ÷ Target s.d. status
            date (hari ini) — berbeda dari SPI periode di Executive / weekly report.
          </>
        ) : (
          <>
            RAG: Green jika SPI ≥ {greenMin}, Yellow jika SPI ≥ {yellowMin}, else Red. Atur ambang
            di tab <strong>Reports</strong>.
            {detail.health.health_source === "active_week_live" && (
              <>
                {" "}
                <strong>Minggu laporan aktif:</strong> target mengikuti rencana kumulatif s.d. as
                of today; actual = akumulasi progress task live s.d. tanggal yang sama.
              </>
            )}
            {detail.health.health_source === "weekly_snapshot" &&
              detail.health.snapshot_week_start && (
                <>
                  {" "}
                  Periode weekly (terkunci):{" "}
                  {formatDisplayDateRange(
                    detail.health.snapshot_week_start,
                    detail.health.snapshot_week_end,
                  )}
                  .
                </>
              )}
          </>
        )}
      </p>

      {(msg || (canAdvance && gate) || canAdvance || canShowDelete) && (
        <div className="project-health-footer">
          {msg && <TabAlert message={msg} variant={msgIsError ? "error" : "success"} />}

          {canAdvance && gate && gate.items.length > 0 && (
            <div className="project-health-gate">
              <p className="project-health-gate-title">Syarat lanjut fase</p>
              <ul className="plain phase-gate-list">
                {gate.items.map((it) => (
                  <li key={it.id} className={it.ok ? "gate-ok" : "gate-fail"}>
                    <span className="phase-gate-icon" aria-hidden>
                      {it.ok ? "✓" : "○"}
                    </span>
                    {it.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canAdvance && (
            <TabPhaseFooter nested>
              {showDeckLink && (
                <button
                  type="button"
                  className="link-button project-health-secondary-link"
                  onClick={() =>
                    downloadFile(
                      `/documents/templates/${
                        detail.current_phase === "pre_kickoff" ? "pre_kickoff_deck" : "kickoff_deck"
                      }/download`,
                    )
                  }
                >
                  Unduh deck presentasi
                </button>
              )}
              <button
                type="button"
                className="primary btn-phase-advance"
                onClick={onAdvance}
                disabled={advanceBusy || gateLoading || (gate ? !gate.can_advance : false)}
                aria-busy={advanceBusy || gateLoading}
              >
                {advanceBusy
                  ? "Memproses…"
                  : gateLoading
                    ? "Memuat syarat…"
                    : `Lanjut fase${gate?.next_phase ? ` → ${PHASE_NEXT_LABEL[gate.next_phase] ?? gate.next_phase}` : ""}`}
              </button>
            </TabPhaseFooter>
          )}

          {canShowDelete && (
            <div className="project-health-danger">
              <button type="button" className="danger-link" onClick={deleteProject}>
                Hapus proyek
              </button>
              <p className="text-muted project-health-danger-hint">
                Hanya sebelum delivery; tidak jika ada approval pending.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
