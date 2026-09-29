import {
  Children,
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  downloadFile,
  formatApiError,
  getErrorMessage,
  previewFile,
} from "../api";
import { UserNotice } from "../components/UserNotice";
import { useAuth } from "../auth";
import {
  ChartPanelToolbar,
  ChartPointTooltip,
  ChartZoomViewport,
  useChartSvgRef,
  useChartTooltip,
  useChartZoom,
} from "../components/ChartPanelTools";
import { TabDocumentUpload } from "../components/TabDocumentUpload";
import {
  formatDisplayDate,
  formatDisplayDateFromMs,
  formatDisplayDateTime,
  toDateInputValue,
} from "../lib/formatDate";
import { newId } from "../lib/newId";
import {
  formatDraftWeightErrors,
  validateDraftTimelineWeight,
} from "../lib/timelineWeightValidation";
import { formatProjectPhase } from "../lib/projectPhase";
import { formatClickUpSyncMessage, syncClickUpProgress } from "../clickupSync";

type ProjectDetail = {
  id?: number;
  code: string;
  name: string;
  methodology?: string;
  document_repo_url?: string | null;
  current_phase: string;
  delivery_started_at?: string | null;
  weekly_report_anchor_weekday?: number;
  weekly_report_cutoff_offset_days?: number;
  weekly_report_first_anchor_date?: string | null;
  kickoff_timeline_confirmed_at?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  clickup_provision_status?: string;
  status?: string;
  sph_total_rupiah?: number | null;
  planned_md?: number | null;
  sph_no?: string | null;
  project_manager?: string | null;
  project_brief?: string | null;
  health: {
    spi: number | null;
    rag_overall: string | null;
    planned_progress_pct: number | null;
    actual_progress_pct: number | null;
    health_source?: string;
    snapshot_week_start?: string;
    snapshot_week_end?: string;
    project_start_date?: string | null;
    project_end_date?: string | null;
    status_date?: string | null;
    as_of?: string;
    progress_deviation_pct?: number | null;
    config?: {
      spi_green_min?: number;
      spi_yellow_min?: number;
    };
  };
  bast_checklist: Record<string, unknown>;
};

const PROJECT_TABS = [
  { id: "sph", label: "SPH" },
  { id: "po", label: "PO" },
  { id: "pre_kickoff", label: "Kick Off" },
  { id: "milestones", label: "Timeline" },
  { id: "change_requests", label: "Change Request" },
  { id: "clickup", label: "ClickUp" },
  { id: "evaluation", label: "Task" },
  { id: "reports", label: "Reports" },
  { id: "members", label: "Members" },
  { id: "documents", label: "Documents" },
  { id: "reminders", label: "Reminders" },
  { id: "audit", label: "Audit trail" },
  { id: "bast", label: "Closing" },
] as const;

const PHASE_NEXT_LABEL: Record<string, string> = {
  kickoff: "Kick Off",
  in_delivery: "Project Start",
  bast: "BAST / evaluasi",
  closed: "Closing (done)",
};

const DELIVERY_PHASES = new Set(["in_delivery", "bast", "closed"]);

function TabShell({ children }: { children: ReactNode }) {
  return <div className="tab-page tab-page--wide">{children}</div>;
}

function TabAlert({
  message,
  variant,
}: {
  message?: string;
  variant?: "success" | "error" | "info";
}) {
  return <UserNotice message={message} variant={variant} />;
}

function TabNoticeStack({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div className="tab-page-notices">{items}</div>;
}

const TAB_READONLY_MSG = {
  sph: "SPH hanya baca — sudah lanjut ke fase Kick Off.",
  kickoff: "Kick Off hanya baca — proyek sudah in delivery.",
  po: "PO hanya baca — proyek sudah closed.",
} as const;

function TabReadOnlyNotice({ message }: { message: string }) {
  return <UserNotice message={message} variant="info" className="tab-readonly-notice" />;
}

function priorPhasesReadOnly(detail: ProjectDetail): boolean {
  return DELIVERY_PHASES.has(detail.current_phase);
}

function poTabReadOnly(detail: ProjectDetail): boolean {
  return detail.current_phase === "closed" || detail.status === "closed";
}

function poFormComplete(form: {
  po_no: string;
  po_name: string;
  po_due_date: string;
  service_items: { name: string }[];
}): boolean {
  const hasNo = Boolean(form.po_no.trim());
  const hasDue = Boolean(form.po_due_date);
  const hasItems = form.service_items.some((s) => s.name.trim());
  const hasTitle = Boolean(form.po_name.trim());
  return hasNo && hasDue && (hasItems || hasTitle);
}

function sphTimelineEditable(detail: ProjectDetail): boolean {
  if (detail.kickoff_timeline_confirmed_at) return false;
  return !["kickoff", "in_delivery", "bast", "closed"].includes(detail.current_phase);
}

function milestoneStructureEditable(detail: ProjectDetail): boolean {
  if (detail.delivery_started_at) return false;
  return detail.current_phase === "pre_kickoff" || detail.current_phase === "kickoff";
}

function milestoneProgressEditable(detail: ProjectDetail): boolean {
  if (milestoneStructureEditable(detail)) return true;
  return detail.current_phase === "in_delivery" || detail.current_phase === "bast";
}

function timelineProjectStartEditable(detail: ProjectDetail): boolean {
  return !!detail.kickoff_timeline_confirmed_at && detail.current_phase !== "closed";
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState("sph");
  const [milestoneRefreshKey, setMilestoneRefreshKey] = useState(0);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [gateRefreshKey, setGateRefreshKey] = useState(0);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);
  const [advanceBusy, setAdvanceBusy] = useState(false);

  const refreshProject = () =>
    api<ProjectDetail>(`/projects/${projectId}`).then((d) => {
      setDetail(d);
      setGateRefreshKey((k) => k + 1);
      return d;
    });

  const load = refreshProject;

  useEffect(() => {
    load().catch((e) => {
      const message = getErrorMessage(e);
      if (message.includes("[Data tidak ditemukan]")) {
        navigate("/projects", { replace: true });
        return;
      }
      setMsgIsError(true);
      setMsg(message);
    });
  }, [projectId, navigate]);

  const advancePhase = async () => {
    setMsg("");
    setMsgIsError(false);
    setAdvanceBusy(true);
    try {
      await api(`/projects/${projectId}/advance-phase`, { method: "POST" });
      setMsg("Fase proyek berhasil dilanjutkan.");
      await load();
    } catch (e) {
      setMsgIsError(true);
      setMsg(getErrorMessage(e));
    } finally {
      setAdvanceBusy(false);
    }
  };

  return (
    <>
      <header className="project-page-head">
        <h1 className="page-title">
          {detail?.code} — {detail?.name}
        </h1>
        <div className="project-page-head__meta">
          {detail?.project_manager && (
            <span className="project-page-head__chip">
              PM <strong>{detail.project_manager}</strong>
            </span>
          )}
          {detail?.sph_no && (
            <span className="project-page-head__chip">
              SPH No. <strong>{detail.sph_no}</strong>
            </span>
          )}
          <span className="text-muted">Fase proyek</span>
          <span className="badge badge-indigo">
            {detail ? formatProjectPhase(detail.current_phase) : "—"}
          </span>
        </div>
      </header>
      {detail && (
        <ProjectHealthPanel
          projectId={projectId}
          detail={detail}
          gateRefreshKey={gateRefreshKey}
          canAdvance={can("projects.write")}
          canEditPm={can("projects.write")}
          msg={msg}
          msgIsError={msgIsError}
          onAdvance={advancePhase}
          advanceBusy={advanceBusy}
          onProjectUpdated={load}
          canDelete={can("projects.write")}
          onDeleted={() => {
            window.location.href = "/projects";
          }}
        />
      )}
      <div className="tabs" role="tablist">
        {PROJECT_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`tab-btn${tab === id ? " tab-btn--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <TabShell>
      {tab === "sph" && detail && (
        <SphTab
          projectId={projectId}
          projectMethodology={detail.methodology ?? "waterfall"}
          timelineEditable={sphTimelineEditable(detail)}
          readOnlyPhase={priorPhasesReadOnly(detail)}
          onMethodologyChange={load}
          onProjectRefresh={load}
          onDraftTimelineChanged={() => setMilestoneRefreshKey((k) => k + 1)}
          onAdvanceToKickOff={() => {
            setMilestoneRefreshKey((k) => k + 1);
            load();
            setTab("pre_kickoff");
          }}
        />
      )}
      {tab === "po" && detail && (
        <PoTab
          projectId={projectId}
          readOnly={poTabReadOnly(detail)}
          currentPhase={detail.current_phase}
          onProjectRefresh={load}
        />
      )}
      {tab === "pre_kickoff" && detail && (
        <PreKickoffTab
          projectId={projectId}
          readOnly={priorPhasesReadOnly(detail)}
          onTimelineChanged={() => setMilestoneRefreshKey((k) => k + 1)}
          onProjectRefresh={load}
        />
      )}
      {tab === "members" && <MembersTab projectId={projectId} />}
      {tab === "milestones" && detail && (
        <MilestonesTab
          projectId={projectId}
          refreshKey={milestoneRefreshKey}
          health={detail.health}
          plannedStartDate={detail.planned_start_date ?? null}
          timelineStartEditable={timelineProjectStartEditable(detail)}
          structureEditable={milestoneStructureEditable(detail)}
          progressEditable={milestoneProgressEditable(detail)}
          onProjectRefresh={load}
        />
      )}
      {tab === "change_requests" && detail && (
        <ChangeRequestsTab
          projectId={projectId}
          inDelivery={DELIVERY_PHASES.has(detail.current_phase)}
        />
      )}
      {tab === "documents" && <DocumentsTab projectId={projectId} detail={detail} />}
      {tab === "clickup" && <ClickUpTab projectId={projectId} />}
      {tab === "reports" && detail && (
        <ReportsTab
          projectId={projectId}
          projectCode={detail.code}
          projectName={detail.name}
          currentPhase={detail.current_phase}
          deliveryStarted={!!detail.delivery_started_at}
          kickoffTimelineConfirmed={!!detail.kickoff_timeline_confirmed_at}
          onProjectRefresh={load}
        />
      )}
      {tab === "reminders" && <RemindersTab projectId={projectId} />}
      {tab === "audit" && <AuditTrailTab projectId={projectId} refreshKey={gateRefreshKey} />}
      {tab === "evaluation" && <EvaluationTab projectId={projectId} />}
      {tab === "bast" && detail && (
        <ClosingProjectTab
          projectId={projectId}
          detail={detail}
          checklist={detail.bast_checklist}
          onSaved={load}
        />
      )}
      </TabShell>
    </>
  );
}

function ProjectHealthPanel({
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

      <div className="project-health-table-wrap">
        <table className="data-table health-metrics-table">
          <thead>
            <tr>
              <th>Status date</th>
              <th className="num">Target (%)</th>
              <th className="num">Progress actual (%)</th>
              <th className="num">Deviasi (%)</th>
              <th className="num">SPI</th>
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
            Metrik (SPI/RAG) aktif setelah timeline Kick Off dikonfirmasi. SPI = Actual ÷ Target
            (per status date / cut-off minggu laporan aktif).
          </>
        ) : (
          <>
            RAG: Green jika SPI ≥ {greenMin}, Yellow jika SPI ≥ {yellowMin}, else Red. Atur ambang
            di tab <strong>Reports</strong>.
            {detail.health.health_source === "active_week_live" && (
              <>
                {" "}
                <strong>Minggu aktif:</strong> target = planned kumulatif per cut-off minggu ini;
                actual = progress task live (s.d. hari ini).
              </>
            )}
            {detail.health.health_source === "weekly_snapshot" &&
              detail.health.snapshot_week_start && (
                <>
                  {" "}
                  Periode weekly (terkunci): {detail.health.snapshot_week_start} —{" "}
                  {detail.health.snapshot_week_end}.
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
            <div className="project-health-actions">
              <button
                type="button"
                className="primary"
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
            </div>
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

type PoServiceItem = {
  id: string;
  name: string;
  qty: number;
  uom: string;
  target_delivery: string;
  warranty: string;
  unit_price: number;
};

type PoPaymentTerm = { label: string; percent_pct: string; due_date: string };

type PoForm = {
  po_no: string;
  po_name: string;
  buyer_name: string;
  contract_number: string;
  quotation_reference: string;
  po_due_date: string;
  po_payment_terms: PoPaymentTerm[];
  service_items: PoServiceItem[];
  po_sub_total: number | null;
};

function poFieldClean(v: string | null | undefined): string {
  if (v == null) return "";
  const t = v.trim();
  return t === "-" ? "" : t;
}

function formatIdr(n: number): string {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
}

type ChangeRequestRow = {
  id: number;
  cr_no: string;
  title: string;
  background: string | null;
  scope_change: string | null;
  schedule_impact_days: number | null;
  cost_impact_rupiah: number | null;
  priority: string;
  status: string;
  decision_comment: string | null;
};

function ChangeRequestsTab({
  projectId,
  inDelivery,
}: {
  projectId: number;
  inDelivery: boolean;
}) {
  const { can } = useAuth();
  const canWrite = can("projects.write");
  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    background: "",
    scope_change: "",
    schedule_impact_days: "",
    cost_impact_rupiah: "",
    priority: "medium",
  });
  const load = () =>
    api<ChangeRequestRow[]>(`/projects/${projectId}/change-requests`).then(setRows);
  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
  }, [projectId]);
  const createCr = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/change-requests`, {
        method: "POST",
        body: JSON.stringify({
          title: draft.title.trim(),
          background: draft.background || null,
          scope_change: draft.scope_change || null,
          schedule_impact_days: draft.schedule_impact_days
            ? Number(draft.schedule_impact_days)
            : null,
          cost_impact_rupiah: draft.cost_impact_rupiah
            ? Number(draft.cost_impact_rupiah)
            : null,
          priority: draft.priority,
        }),
      });
      setDraft({
        title: "",
        background: "",
        scope_change: "",
        schedule_impact_days: "",
        cost_impact_rupiah: "",
        priority: "medium",
      });
      setMsg("Change Request draft dibuat.");
      load();
    } catch (err) {
      setMsg(getErrorMessage(err));
    }
  };
  const act = async (id: number, path: string, body?: object) => {
    setMsg("");
    try {
      await api(`/projects/${projectId}/change-requests/${id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
    } catch (err) {
      setMsg(getErrorMessage(err));
    }
  };
  return (
    <div className="card">
      <h2 className="card-title">Change Request (CR)</h2>
      <p className="text-muted">
        Mekanisme CR standar: draft → submit → review (approve/reject) → implement.{" "}
        {inDelivery
          ? "Gunakan CR untuk perubahan scope/jadwal/biaya setelah baseline Kick Off."
          : "CR paling relevan setelah proyek in delivery."}
      </p>
      <TabAlert message={msg} />
      {canWrite && (
        <form onSubmit={createCr} className="cr-form">
          <h3 className="subsection-title">Buat CR baru</h3>
          <div className="form-row">
            <label>Judul CR</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <label>Latar belakang</label>
            <textarea
              rows={2}
              value={draft.background}
              onChange={(e) => setDraft({ ...draft, background: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Perubahan scope</label>
            <textarea
              rows={2}
              value={draft.scope_change}
              onChange={(e) => setDraft({ ...draft, scope_change: e.target.value })}
            />
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label>Dampak jadwal (hari)</label>
              <input
                type="number"
                value={draft.schedule_impact_days}
                onChange={(e) =>
                  setDraft({ ...draft, schedule_impact_days: e.target.value })
                }
              />
            </div>
            <div className="form-row">
              <label>Dampak biaya (Rp)</label>
              <input
                type="number"
                value={draft.cost_impact_rupiah}
                onChange={(e) =>
                  setDraft({ ...draft, cost_impact_rupiah: e.target.value })
                }
              />
            </div>
          </div>
          <button type="submit" className="primary">
            Simpan draft CR
          </button>
        </form>
      )}
      <div className="table-scroll" style={{ marginTop: "1rem" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Judul</th>
              <th>Status</th>
              <th>Prioritas</th>
              <th>Dampak hari</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  Belum ada CR.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.cr_no}</td>
                  <td>{r.title}</td>
                  <td>{r.status}</td>
                  <td>{r.priority}</td>
                  <td>{r.schedule_impact_days ?? "—"}</td>
                  <td>
                    {canWrite && r.status === "draft" && (
                      <button type="button" onClick={() => act(r.id, "submit")}>
                        Submit
                      </button>
                    )}
                    {canWrite && r.status === "submitted" && (
                      <>
                        <button
                          type="button"
                          onClick={() => act(r.id, "decide", { approve: true })}
                        >
                          Approve
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() => act(r.id, "decide", { approve: false })}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {canWrite && r.status === "approved" && (
                      <button type="button" onClick={() => act(r.id, "implement")}>
                        Implement
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PoTab({
  projectId,
  readOnly,
  currentPhase,
  onProjectRefresh,
}: {
  projectId: number;
  readOnly?: boolean;
  currentPhase?: string;
  onProjectRefresh?: () => void;
}) {
  const emptyItem = (): PoServiceItem => ({
    id: newId(),
    name: "",
    qty: 0,
    uom: "",
    target_delivery: "",
    warranty: "",
    unit_price: 0,
  });
  const [form, setForm] = useState<PoForm>({
    po_no: "",
    po_name: "",
    buyer_name: "",
    contract_number: "",
    quotation_reference: "",
    po_due_date: "",
    po_payment_terms: [{ label: "Termin 1", percent_pct: "", due_date: "" }],
    service_items: [emptyItem()],
    po_sub_total: null,
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{
      po_no: string | null;
      po_name: string | null;
      buyer_name: string | null;
      contract_number: string | null;
      quotation_reference: string | null;
      po_due_date: string | null;
      po_payment_terms: { label?: string; percent_pct?: number; due_date?: string }[];
      service_items: PoServiceItem[];
      po_sub_total: number | null;
    }>(`/projects/${projectId}/po`)
      .then((p) => {
        setForm({
          po_no: poFieldClean(p.po_no),
          po_name: poFieldClean(p.po_name),
          buyer_name: poFieldClean(p.buyer_name),
          contract_number: poFieldClean(p.contract_number),
          quotation_reference: poFieldClean(p.quotation_reference),
          po_due_date: toDateInputValue(p.po_due_date),
          po_payment_terms: (p.po_payment_terms?.length ? p.po_payment_terms : [{ label: "Termin 1" }]).map(
            (t) => ({
              label: t.label ?? "",
              percent_pct: t.percent_pct != null ? String(t.percent_pct) : "",
              due_date: t.due_date ?? "",
            }),
          ),
          service_items: (p.service_items?.length ? p.service_items : [emptyItem()]).map((s) => ({
            id: s.id || newId(),
            name: s.name ?? "",
            qty: Number(s.qty) || 0,
            uom: s.uom ?? "",
            target_delivery: s.target_delivery ?? "",
            warranty: s.warranty ?? "",
            unit_price: Number(s.unit_price) || 0,
          })),
          po_sub_total: p.po_sub_total,
        });
      })
      .catch((e) => setMsg(getErrorMessage(e)));
  }, [projectId]);
  const lineSub = form.service_items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
  const contractTotal = form.po_sub_total ?? lineSub;
  const termPctSum = form.po_payment_terms.reduce(
    (s, t) => s + (Number(t.percent_pct) || 0),
    0,
  );
  const msgOk = msg === "PO disimpan.";
  const save = async () => {
    if (readOnly) return;
    setMsg("");
    try {
      const res = await api<{ po_sub_total: number | null }>(`/projects/${projectId}/po`, {
        method: "PUT",
        body: JSON.stringify({
          po_no: form.po_no.trim() || null,
          po_name: form.po_name.trim() || null,
          buyer_name: form.buyer_name.trim() || null,
          contract_number: form.contract_number.trim() || null,
          quotation_reference: form.quotation_reference.trim() || null,
          po_due_date: form.po_due_date || null,
          po_payment_terms: form.po_payment_terms
            .filter((t) => t.label.trim())
            .map((t) => ({
              label: t.label.trim(),
              percent_pct: t.percent_pct ? Number(t.percent_pct) : null,
              due_date: t.due_date || null,
            })),
          service_items: form.service_items.filter((s) => s.name.trim()),
        }),
      });
      setForm((f) => ({ ...f, po_sub_total: res.po_sub_total }));
      setMsg("PO disimpan.");
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card card--sph card--po">
      <div className="po-page-header">
        <div className="po-page-header-text">
          <h2 className="card-title">Purchase Order</h2>
          <p className="text-muted form-hint">
            Opsional di awal proyek. Wajib lengkap sebelum fase BAST dan Closing: nomor PO, due date,
            service item, atau judul PO.
          </p>
        </div>
        <div className="po-kpi" aria-live="polite">
          <span className="po-kpi-label">Nilai kontrak (sistem)</span>
          <strong className="po-kpi-value">{formatIdr(contractTotal)}</strong>
          <span className="po-kpi-hint">Dari subtotal service items</span>
        </div>
      </div>

      <TabAlert message={msg} variant={msg ? (msgOk ? "success" : "error") : undefined} />
      {readOnly && <TabReadOnlyNotice message={TAB_READONLY_MSG.po} />}
      {!readOnly &&
        (currentPhase === "in_delivery" || currentPhase === "bast") &&
        !poFormComplete(form) && (
          <TabAlert
            message="Data PO wajib lengkap sebelum lanjut ke fase BAST atau Closing (nomor PO, due date, service item atau judul PO)."
            variant="info"
          />
        )}

      <fieldset disabled={readOnly} className="sph-fieldset">
        <section className="sph-info-panel" aria-labelledby="po-info-heading">
          <h3 id="po-info-heading" className="sph-info-panel__title">
            Identitas PO
          </h3>
          <div className="sph-info-grid">
            <div className="form-row sph-info-grid__full">
              <label htmlFor="po-no">Nomor PO</label>
              <input
                id="po-no"
                className="sph-info-input"
                placeholder="Contoh: PO-2026-001"
                value={form.po_no}
                onChange={(e) => setForm({ ...form, po_no: e.target.value })}
              />
            </div>
            <div className="form-row sph-info-grid__full">
              <label htmlFor="po-name">Judul / nama PO</label>
              <input
                id="po-name"
                className="sph-info-input"
                placeholder="Judul kontrak atau scope PO"
                value={form.po_name}
                onChange={(e) => setForm({ ...form, po_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-due">Due date PO</label>
              <input
                id="po-due"
                className="sph-info-input"
                type="date"
                value={form.po_due_date}
                onChange={(e) => setForm({ ...form, po_due_date: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-buyer">Nama buyer</label>
              <input
                id="po-buyer"
                className="sph-info-input"
                placeholder="Pembeli / counterparty"
                value={form.buyer_name}
                onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-contract">Nomor kontrak</label>
              <input
                id="po-contract"
                className="sph-info-input"
                placeholder="Opsional"
                value={form.contract_number}
                onChange={(e) => setForm({ ...form, contract_number: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-quot">Referensi quotation</label>
              <input
                id="po-quot"
                className="sph-info-input"
                placeholder="No. SPH / penawaran"
                value={form.quotation_reference}
                onChange={(e) => setForm({ ...form, quotation_reference: e.target.value })}
              />
            </div>
          </div>
        </section>

        <h3 className="subsection-title">Termin pembayaran</h3>
        <p className="text-muted form-hint" style={{ marginTop: "-0.5rem", marginBottom: "0.65rem" }}>
          Total persentase:{" "}
          <span className={Math.abs(termPctSum - 100) > 0.5 ? "error" : ""}>
            {termPctSum.toFixed(0)}%
          </span>
          {termPctSum > 0 ? " · ideal 100%" : ""}
        </p>
        <div className="sph-list-panel">
        <div className="po-section-toolbar">
          <span className="text-muted form-hint" style={{ margin: 0 }}>
            Tambah baris termin sesuai kontrak.
          </span>
          <button
            type="button"
            className="po-btn-add"
            onClick={() =>
              setForm({
                ...form,
                po_payment_terms: [
                  ...form.po_payment_terms,
                  {
                    label: `Termin ${form.po_payment_terms.length + 1}`,
                    percent_pct: "",
                    due_date: "",
                  },
                ],
              })
            }
          >
            + Termin
          </button>
        </div>
        <div className="table-scroll po-table-wrap">
          <table className="data-table po-table po-table--termin">
            <thead>
              <tr>
                <th>Label</th>
                <th>Bobot %</th>
                <th>Jatuh tempo</th>
                <th className="po-col-actions" />
              </tr>
            </thead>
            <tbody>
              {form.po_payment_terms.map((t, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      className="po-cell-input"
                      value={t.label}
                      onChange={(e) => {
                        const next = [...form.po_payment_terms];
                        next[idx] = { ...t, label: e.target.value };
                        setForm({ ...form, po_payment_terms: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--narrow"
                      type="number"
                      min={0}
                      max={100}
                      value={t.percent_pct}
                      onChange={(e) => {
                        const next = [...form.po_payment_terms];
                        next[idx] = { ...t, percent_pct: e.target.value };
                        setForm({ ...form, po_payment_terms: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input"
                      type="date"
                      value={t.due_date}
                      onChange={(e) => {
                        const next = [...form.po_payment_terms];
                        next[idx] = { ...t, due_date: e.target.value };
                        setForm({ ...form, po_payment_terms: next });
                      }}
                    />
                  </td>
                  <td className="po-col-actions">
                    <button
                      type="button"
                      className="danger-link"
                      disabled={form.po_payment_terms.length <= 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          po_payment_terms: form.po_payment_terms.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>

        <h3 className="subsection-title">Service items</h3>
        <div className="sph-list-panel">
        <div className="po-section-toolbar">
          <span className="text-muted form-hint" style={{ margin: 0 }}>
            Baris layanan menentukan subtotal kontrak.
          </span>
          <button
            type="button"
            className="po-btn-add"
            onClick={() =>
              setForm({ ...form, service_items: [...form.service_items, emptyItem()] })
            }
          >
            + Service item
          </button>
        </div>
        <div className="table-scroll po-table-wrap">
          <table className="data-table po-table po-table--services">
            <thead>
              <tr>
                <th>Item / layanan</th>
                <th>Qty</th>
                <th>Satuan</th>
                <th>Target delivery</th>
                <th>Garansi</th>
                <th>Harga satuan</th>
                <th>Subtotal</th>
                <th className="po-col-actions" />
              </tr>
            </thead>
            <tbody>
              {form.service_items.map((s, idx) => (
                <tr key={s.id}>
                  <td>
                    <input
                      className="po-cell-input"
                      placeholder="Nama item"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, name: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--narrow"
                      type="number"
                      min={0}
                      value={s.qty || ""}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, qty: Number(e.target.value) };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--narrow"
                      placeholder="Lot"
                      value={s.uom}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, uom: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input"
                      type="date"
                      value={s.target_delivery}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, target_delivery: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input"
                      placeholder="—"
                      value={s.warranty}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, warranty: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--money"
                      type="number"
                      min={0}
                      value={s.unit_price || ""}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, unit_price: Number(e.target.value) };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td className="po-line-sub">{formatIdr(s.qty * s.unit_price)}</td>
                  <td className="po-col-actions">
                    <button
                      type="button"
                      className="danger-link"
                      disabled={form.service_items.length <= 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          service_items: form.service_items.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sph-total-line">
          Subtotal PO (preview): <strong>{formatIdr(lineSub)}</strong>
        </p>
        </div>

        <button type="button" className="primary" onClick={save} disabled={readOnly}>
          Simpan PO
        </button>
      </fieldset>
      <TabDocumentUpload
        projectId={projectId}
        docType="po"
        phase="po_received"
        title="Dokumen PO"
        hint="Unggah scan/PDF PO — tersimpan di PDC dan (jika dikonfigurasi) folder Google Drive proyek."
        readOnly={readOnly}
      />
    </div>
  );
}

function MembersTab({ projectId }: { projectId: number }) {
  const { can } = useAuth();
  const canEdit = can("projects.assign_members") || can("projects.write");
  const [members, setMembers] = useState<
    { id: number; full_name: string; email: string; role_label: string }[]
  >([]);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", role_label: "" });
  const [msg, setMsg] = useState("");
  const load = () => api<typeof members>(`/projects/${projectId}/roster`).then(setMembers);
  useEffect(() => {
    load().catch(() => {});
  }, [projectId]);
  const addMember = async () => {
    if (!addForm.full_name.trim()) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/roster`, {
        method: "POST",
        body: JSON.stringify(addForm),
      });
      setAddForm({ full_name: "", email: "", role_label: "" });
      load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const removeMember = async (memberId: number) => {
    if (!window.confirm("Hapus anggota dari daftar?")) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/roster/${memberId}`, { method: "DELETE" });
      load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card">
      <h2 className="card-title">Anggota proyek</h2>
      <TabAlert message={msg} />
      <table className="data-table">
        <thead>
          <tr>
            <th>Nama lengkap</th>
            <th>Email</th>
            <th>Peran</th>
            {canEdit && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.full_name}</td>
              <td>{m.email || "—"}</td>
              <td>{m.role_label || "—"}</td>
              {canEdit && (
                <td>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() => removeMember(m.id)}
                  >
                    Hapus
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <>
          <div className="form-row" style={{ marginTop: "1rem" }}>
            <label>Nama lengkap</label>
            <input
              value={addForm.full_name}
              onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Peran</label>
            <input
              value={addForm.role_label}
              placeholder="PM, Developer, …"
              onChange={(e) => setAddForm({ ...addForm, role_label: e.target.value })}
            />
          </div>
          <button type="button" className="primary" onClick={addMember}>
            Tambah anggota
          </button>
        </>
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null || Number.isNaN(pct)) {
    return <span className="text-muted">—</span>;
  }
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <div className="inline-progress" title={`${v}%`}>
      <div className="inline-progress__track">
        <div className="inline-progress__fill" style={{ width: `${v}%` }} />
      </div>
      <span className="inline-progress__label">{v}%</span>
    </div>
  );
}

function workflowStatusClass(status: string | null | undefined): string {
  const key = (status ?? "todo").replace(/\s+/g, "-").toLowerCase();
  if (key === "completed" || key === "complete" || key === "done") {
    return "workflow-status--done";
  }
  if (key === "in-progress" || key === "in_progress") {
    return "workflow-status--in-progress";
  }
  if (key === "not-started") {
    return "workflow-status--todo";
  }
  return `workflow-status--${key}`;
}

function WorkflowStatusBadge({
  status,
  raw,
  href,
}: {
  status: string | null | undefined;
  raw?: string | null;
  href?: string | null;
}) {
  if (!status) return <span className="text-muted">—</span>;
  const title = raw && raw !== status ? `ClickUp: ${raw}` : undefined;
  const inner = <span className={`workflow-status ${workflowStatusClass(status)}`}>{status}</span>;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title}>
        {inner}
      </a>
    );
  }
  return title ? <span title={title}>{inner}</span> : inner;
}

function itemTypePill(type: string | undefined) {
  const t = type ?? "task";
  return <span className={`item-type-pill item-type-pill--${t}`}>{t}</span>;
}

type TaskRecapRow = {
  clickup_task_id?: string;
  parent_clickup_task_id?: string | null;
  name: string;
  status: string;
  status_raw?: string | null;
  due_date: string | null;
  is_closed: boolean;
  url?: string | null;
  percent_complete?: number | null;
  phase_name?: string | null;
  phase_status?: string | null;
  item_type?: string;
  depth?: number;
};

type TaskRecapGroup = {
  list_id: string;
  list_name: string;
  sort_order?: number;
  phase_status?: string | null;
  phase_progress_pct?: number | null;
  tasks: TaskRecapRow[];
};

function TaskRecapTables({
  groups,
  tasks,
}: {
  groups?: TaskRecapGroup[];
  tasks: TaskRecapRow[];
}) {
  const sections =
    groups && groups.length > 0
      ? groups
      : [{ list_id: "", list_name: "Semua task", tasks: tasks }];
  return (
    <div className="task-recap-unified card task-recap-card">
      <div className="task-recap-grid task-recap-grid--head" role="row">
        <span>Nama</span>
        <span>Tipe</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Due</span>
        <span>Closed</span>
      </div>
      {sections.map((g) => (
        <section key={g.list_id || g.list_name} className="task-recap-block">
          <div className="task-recap-grid task-recap-grid--phase">
            <div className="task-recap-phase-title">
              <h3 className="task-recap-group__title">{g.list_name}</h3>
              {g.phase_status && (
                <span
                  className={`phase-status phase-status--${g.phase_status.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {g.phase_status}
                </span>
              )}
            </div>
            <span />
            <span />
            <div className="task-recap-phase-progress">
              {g.phase_progress_pct != null ? (
                <ProgressBar pct={g.phase_progress_pct} />
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
            <span />
            <span />
          </div>
          {g.tasks.length === 0 ? (
            <p className="text-muted task-recap-empty">Tidak ada task di list ini.</p>
          ) : (
            g.tasks.map((t) => (
              <div
                key={t.clickup_task_id ?? `${g.list_id}-${t.name}`}
                className={`task-recap-grid task-recap-grid--row${(t.depth ?? 0) > 0 ? " task-recap-row--child" : ""}`}
                role="row"
              >
                <div
                  className="task-recap-name"
                  style={{ paddingLeft: `${0.35 + (t.depth ?? 0) * 1.15}rem` }}
                >
                  {(t.depth ?? 0) > 0 && <span className="task-recap-tree" aria-hidden />}
                  {t.url ? (
                    <a href={t.url} target="_blank" rel="noreferrer" className="task-recap-link">
                      {t.name}
                    </a>
                  ) : (
                    t.name
                  )}
                </div>
                <div>{itemTypePill(t.item_type)}</div>
                <div>
                  <WorkflowStatusBadge status={t.status} raw={t.status_raw} href={t.url} />
                </div>
                <div>
                  <ProgressBar pct={t.percent_complete} />
                </div>
                <div className="task-recap-due">{t.due_date ?? "—"}</div>
                <div>{t.is_closed ? "Ya" : "Tidak"}</div>
              </div>
            ))
          )}
        </section>
      ))}
    </div>
  );
}

type MilestoneRow = {
  id: number;
  name: string;
  module?: string | null;
  start_date: string | null;
  target_date: string | null;
  weight_pct: number;
  status: string;
  is_payment_milestone?: boolean;
  parent_id?: number | null;
  item_type?: string;
  duration_days?: number | null;
  sort_order?: number;
  clickup_task_id?: string | null;
  clickup_name?: string | null;
  clickup_status?: string | null;
  clickup_status_raw?: string | null;
  clickup_url?: string | null;
  clickup_due_date?: string | null;
  clickup_progress_pct?: number | null;
  display_start?: string | null;
  display_end?: string | null;
  display_duration_days?: number | null;
  clickup_only?: boolean;
  phase_id?: number | null;
  expandable?: boolean;
  parent_clickup_task_id?: string | null;
  depth?: number;
  timeline_seq?: number;
};

const GANTT_DAY_MS = 86400000;

function parseTimelineMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = new Date(raw.slice(0, 10)).getTime();
  return Number.isNaN(t) ? null : t;
}

function rowDisplayStart(row: MilestoneRow): string | null {
  return row.start_date;
}

function rowDisplayEnd(row: MilestoneRow): string | null {
  return row.target_date;
}

function startOfWeekMs(ms: number): number {
  const d = new Date(ms);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function TimelineGantt({
  rows,
  rangeRows,
  collapsedPhases,
  collapsedCu,
  onTogglePhase,
  onToggleCu,
}: {
  rows: MilestoneRow[];
  rangeRows?: MilestoneRow[];
  collapsedPhases?: Set<number>;
  collapsedCu?: Set<string>;
  onTogglePhase?: (phaseId: number) => void;
  onToggleCu?: (clickupTaskId: string) => void;
}) {
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.timeline_seq ?? a.sort_order ?? a.id) - (b.timeline_seq ?? b.sort_order ?? b.id)),
    [rows],
  );

  const range = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    const forRange = rangeRows ?? rows;
    for (const row of forRange) {
      const s = parseTimelineMs(rowDisplayStart(row));
      const e = parseTimelineMs(rowDisplayEnd(row));
      if (s == null && e == null) continue;
      const a = s ?? e!;
      const b = e ?? s!;
      min = Math.min(min, a, b);
      max = Math.max(max, a, b);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, span: Math.max(max - min, GANTT_DAY_MS) };
  }, [rows, rangeRows]);

  const weekTicks = useMemo(() => {
    if (!range) return [];
    const ticks: number[] = [];
    let cur = startOfWeekMs(range.min);
    while (cur <= range.max + GANTT_DAY_MS) {
      ticks.push(cur);
      cur += 7 * GANTT_DAY_MS;
    }
    return ticks;
  }, [range]);

  if (!range) {
    return (
      <p className="text-muted gantt-empty">Isi tanggal mulai/selesai untuk menampilkan Gantt.</p>
    );
  }

  const { min, max, span } = range;
  const fmt = (ms: number) => formatDisplayDateFromMs(ms);
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const showToday = todayMs >= min && todayMs <= max;
  const todayLeft = ((todayMs - min) / span) * 100;

  const tooltipFor = (row: MilestoneRow) => {
    const parts = [
      row.name,
      `Baseline: ${formatDisplayDate(row.start_date)} → ${formatDisplayDate(row.target_date)}`,
    ];
    if (row.clickup_name) parts.push(`ClickUp: ${row.clickup_name}`);
    if (row.clickup_status) {
      parts.push(
        row.clickup_status_raw && row.clickup_status_raw !== row.clickup_status
          ? `Status: ${row.clickup_status} (ClickUp: ${row.clickup_status_raw})`
          : `Status: ${row.clickup_status}`,
      );
    }
    if (row.clickup_progress_pct != null) parts.push(`Progress: ${row.clickup_progress_pct}%`);
    return parts.join("\n");
  };

  return (
    <section className="timeline-gantt-pro" aria-label="Gantt timeline">
      <div className="timeline-gantt-pro__toolbar">
        <span className="timeline-gantt-pro__range">
          {fmt(min)} — {fmt(max)}
        </span>
        <div className="timeline-gantt-pro__legend">
          <span>
            <i className="timeline-gantt-pro__swatch timeline-gantt-pro__swatch--phase" /> Phase
          </span>
          <span>
            <i className="timeline-gantt-pro__swatch timeline-gantt-pro__swatch--task" /> Task
          </span>
          <span>
            <i className="timeline-gantt-pro__swatch timeline-gantt-pro__swatch--milestone" />{" "}
            Milestone
          </span>
          <span className="text-muted">Fill = progress ClickUp</span>
        </div>
      </div>
      <div className="timeline-gantt-pro__scroll">
        <div
          className="timeline-gantt-pro__grid"
          style={{ gridTemplateColumns: "minmax(11rem, 26%) 1fr" }}
        >
          <div className="timeline-gantt-pro__head-corner">Timeline</div>
          <div className="timeline-gantt-pro__head-track">
            {weekTicks.map((t) => (
              <div
                key={t}
                className="timeline-gantt-pro__tick"
                style={{ left: `${((t - min) / span) * 100}%` }}
              >
                {fmt(t)}
              </div>
            ))}
            {showToday && (
              <div
                className="timeline-gantt-pro__today-line"
                style={{ left: `${todayLeft}%` }}
                title="Hari ini"
              />
            )}
          </div>
          {sortedRows.map((row) => {
            const startMs = parseTimelineMs(rowDisplayStart(row));
            const endMs = parseTimelineMs(rowDisplayEnd(row));
            const hasBaseline = startMs != null || endMs != null;
            const s = startMs ?? endMs ?? min;
            const e = endMs ?? startMs ?? s;
            const left = hasBaseline ? ((Math.min(s, e) - min) / span) * 100 : 0;
            const width = hasBaseline
              ? Math.max(((Math.abs(e - s) || GANTT_DAY_MS) / span) * 100, 0.8)
              : 0;
            const kind = row.item_type ?? "task";
            const progress = Math.min(100, Math.max(0, row.clickup_progress_pct ?? 0));
            const isMilestone = kind === "milestone";
            const depth = row.depth ?? (row.parent_id ? 1 : 0);
            const isChild =
              kind === "subtask" ||
              (depth >= 2 && kind !== "phase") ||
              (!!row.parent_clickup_task_id && kind !== "phase");
            const labelClass =
              kind === "phase"
                ? "timeline-gantt-pro__label timeline-gantt-pro__label--phase"
                : isChild
                  ? "timeline-gantt-pro__label timeline-gantt-pro__label--child"
                  : "timeline-gantt-pro__label timeline-gantt-pro__label--task";
            return (
              <Fragment key={row.clickup_only ? `cu-${row.clickup_task_id}` : row.id}>
                <div
                  className={labelClass}
                  style={{ paddingLeft: `${0.25 + depth}rem` }}
                  title={row.name}
                >
                  {kind === "phase" && onTogglePhase && (
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label={collapsedPhases?.has(row.id) ? "Expand phase" : "Collapse phase"}
                      onClick={() => onTogglePhase(row.id)}
                    >
                      {collapsedPhases?.has(row.id) ? "▸" : "▾"}
                    </button>
                  )}
                  {row.expandable && row.clickup_task_id && kind !== "phase" && onToggleCu && (
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label="Expand task"
                      onClick={() => onToggleCu(row.clickup_task_id!)}
                    >
                      {collapsedCu?.has(row.clickup_task_id!) ? "▸" : "▾"}
                    </button>
                  )}
                  {isChild ? <span className="timeline-gantt-pro__tree" aria-hidden /> : null}
                  {row.clickup_url ? (
                    <a href={row.clickup_url} target="_blank" rel="noreferrer">
                      {row.name}
                    </a>
                  ) : (
                    row.name
                  )}
                  {row.clickup_only && (
                    <span className="timeline-gantt-pro__cu-tag">ClickUp</span>
                  )}
                </div>
                <div className="timeline-gantt-pro__track">
                  {weekTicks.map((t) => (
                    <div
                      key={`${row.id}-${t}`}
                      className="timeline-gantt-pro__gridline"
                      style={{ left: `${((t - min) / span) * 100}%` }}
                    />
                  ))}
                  {showToday && (
                    <div
                      className="timeline-gantt-pro__today-line timeline-gantt-pro__today-line--row"
                      style={{ left: `${todayLeft}%` }}
                    />
                  )}
                  {!hasBaseline && !isMilestone ? (
                    <span className="timeline-gantt-pro__no-baseline" title="Tanpa baseline PDC">
                      —
                    </span>
                  ) : isMilestone && hasBaseline ? (
                    <div
                      className={`timeline-gantt-pro__diamond timeline-gantt-pro__diamond--${
                        progress >= 100 ? "done" : "open"
                      }`}
                      style={{ left: `calc(${left + width / 2}% - 6px)` }}
                      title={tooltipFor(row)}
                    />
                  ) : hasBaseline ? (
                    <div
                      className={`timeline-gantt-pro__bar-wrap timeline-gantt-pro__bar-wrap--${kind}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={tooltipFor(row)}
                    >
                      <div className="timeline-gantt-pro__bar-bg" />
                      <div
                        className="timeline-gantt-pro__bar-fill"
                        style={{ width: `${progress}%` }}
                      />
                      {progress > 0 && progress < 100 && (
                        <span className="timeline-gantt-pro__bar-pct">{progress}%</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MilestonesTab({
  projectId,
  refreshKey,
  health,
  plannedStartDate,
  timelineStartEditable,
  structureEditable,
  progressEditable,
  onProjectRefresh,
}: {
  projectId: number;
  refreshKey: number;
  health: ProjectDetail["health"];
  plannedStartDate: string | null;
  timelineStartEditable: boolean;
  structureEditable: boolean;
  progressEditable: boolean;
  onProjectRefresh?: () => void;
}) {
  const [projectStartInput, setProjectStartInput] = useState(
    toDateInputValue(plannedStartDate),
  );
  const [startMsg, setStartMsg] = useState("");
  const [startBusy, setStartBusy] = useState(false);

  useEffect(() => {
    setProjectStartInput(toDateInputValue(plannedStartDate));
  }, [plannedStartDate, refreshKey]);
  const [rebaseReason, setRebaseReason] = useState("");
  const [reqId, setReqId] = useState<number | null>(null);
  const [rebaselineOptIn, setRebaselineOptIn] = useState(false);
  const behind =
    (health.actual_progress_pct ?? 0) < (health.planned_progress_pct ?? 0) - 0.01;
  const ragOk = health.rag_overall === "yellow" || health.rag_overall === "red";
  const rebaselineEligible = behind && ragOk;
  const rebaselineEnabled = rebaselineOptIn && rebaselineEligible;
  const { can } = useAuth();
  const canWriteStructure = can("milestones.write") && structureEditable;
  const [items, setItems] = useState<MilestoneRow[]>([]);
  const [err, setErr] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [newRow, setNewRow] = useState({
    name: "",
    start_date: "",
    target_date: "",
    weight_pct: "",
  });

  const load = useCallback(() => {
    setErr("");
    api<MilestoneRow[]>(`/projects/${projectId}/milestones`)
      .then(setItems)
      .catch((e) => setErr(getErrorMessage(e)));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const syncFromClickUp = async () => {
    setSyncMsg("");
    setSyncBusy(true);
    try {
      const r = await syncClickUpProgress(projectId);
      setSyncMsg(formatClickUpSyncMessage(r));
      load();
      onProjectRefresh?.();
    } catch (e) {
      setSyncMsg(getErrorMessage(e));
    } finally {
      setSyncBusy(false);
    }
  };

  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set());
  const [collapsedCu, setCollapsedCu] = useState<Set<string>>(new Set());

  const timelineSortKey = (m: MilestoneRow) =>
    m.timeline_seq ?? m.sort_order ?? (m.id > 0 ? m.id : -m.id + 1_000_000);

  const orderedItems = useMemo(
    () => [...items].sort((a, b) => timelineSortKey(a) - timelineSortKey(b)),
    [items],
  );

  const visibleItems = useMemo(() => {
    return orderedItems.filter((m) => {
      const phaseId = m.item_type === "phase" ? m.id : m.phase_id ?? null;
      if (phaseId != null && collapsedPhases.has(phaseId) && m.item_type !== "phase") {
        return false;
      }
      if (m.parent_clickup_task_id && collapsedCu.has(m.parent_clickup_task_id)) {
        return false;
      }
      return true;
    });
  }, [orderedItems, collapsedPhases, collapsedCu]);

  const togglePhase = (phaseId: number) => {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const toggleCu = (clickupTaskId: string) => {
    setCollapsedCu((prev) => {
      const next = new Set(prev);
      if (next.has(clickupTaskId)) next.delete(clickupTaskId);
      else next.add(clickupTaskId);
      return next;
    });
  };

  const addMilestone = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRow.name.trim()) return;
    setErr("");
    try {
      await api(`/projects/${projectId}/milestones`, {
        method: "POST",
        body: JSON.stringify({
          name: newRow.name.trim(),
          start_date: newRow.start_date || null,
          target_date: newRow.target_date || null,
          weight_pct: newRow.weight_pct ? Number(newRow.weight_pct) : 0,
        }),
      });
      setNewRow({ name: "", start_date: "", target_date: "", weight_pct: "" });
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const togglePaymentMilestone = async (m: MilestoneRow) => {
    setErr("");
    try {
      await api(`/projects/${projectId}/milestones/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_payment_milestone: !m.is_payment_milestone }),
      });
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const removeMilestone = async (id: number, name: string) => {
    if (!window.confirm(`Hapus milestone "${name}"?`)) return;
    setErr("");
    try {
      await api(`/projects/${projectId}/milestones/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const saveProjectStart = async () => {
    if (!projectStartInput.trim()) {
      setStartMsg("[Data tidak valid] Isi tanggal start proyek.");
      return;
    }
    setStartBusy(true);
    setStartMsg("");
    try {
      await api(`/projects/${projectId}/timeline/project-start`, {
        method: "POST",
        body: JSON.stringify({ start_date: projectStartInput }),
      });
      setStartMsg("Tanggal start proyek disimpan — mulai/target timeline disesuaikan (kalender kerja).");
      load();
      onProjectRefresh?.();
    } catch (e) {
      setStartMsg(getErrorMessage(e));
    } finally {
      setStartBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Timeline proyek</h2>
      <p className="text-muted">
        Jadwal delivery dari konfirmasi Kick Off. Perubahan tanggal start di sini hanya menggeser
        timeline tab ini — draft SPH dan Kick Off tidak berubah.
        {!structureEditable &&
          progressEditable &&
          " Struktur read-only — hanya status/progress atau tanggal start proyek."}
        {!progressEditable && !timelineStartEditable && " Timeline read-only."}
      </p>
      {timelineStartEditable && (
        <div className="timeline-project-start-panel sph-info-panel">
          <div className="form-row" style={{ maxWidth: "22rem" }}>
            <label htmlFor="timeline-project-start">Tanggal start proyek</label>
            <input
              id="timeline-project-start"
              type="date"
              className="sph-info-input"
              value={projectStartInput}
              onChange={(e) => setProjectStartInput(e.target.value)}
            />
          </div>
          <p className="form-hint">
            Mulai dan target phase/task/subtask dihitung ulang dari durasi yang sudah diset
            (hari kerja).
          </p>
          <TabAlert message={startMsg} />
          <div className="ui-toolbar">
            <button
              type="button"
              className="primary"
              disabled={startBusy}
              onClick={() => void saveProjectStart()}
            >
              {startBusy ? "Menyimpan…" : "Simpan tanggal start proyek"}
            </button>
          </div>
        </div>
      )}
      <TabAlert message={err} variant="error" />
      <TabAlert message={syncMsg} />
      <div className="btn-group" style={{ marginBottom: "0.75rem" }}>
        <button type="button" className="primary" disabled={syncBusy} onClick={() => void syncFromClickUp()}>
          {syncBusy ? "Sync…" : "Sync progress dari ClickUp"}
        </button>
      </div>
      {syncBusy && (
        <div className="sync-progress-bar" role="progressbar" aria-busy="true" aria-label="Sinkronisasi ClickUp">
          <div className="sync-progress-bar__indeterminate" />
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-muted">Belum ada timeline terkonfirmasi.</p>
      ) : (
        <>
        <TimelineGantt
          rows={visibleItems}
          rangeRows={orderedItems}
          collapsedPhases={collapsedPhases}
          collapsedCu={collapsedCu}
          onTogglePhase={togglePhase}
          onToggleCu={toggleCu}
        />
        <div
          className={`timeline-detail-unified${canWriteStructure ? " timeline-detail-unified--actions" : ""}`}
        >
          <div className="timeline-detail-grid timeline-detail-grid--head" role="row">
            <span>Nama</span>
            <span>Modul</span>
            <span>Mulai</span>
            <span>Target</span>
            <span>Durasi</span>
            <span>Bobot %</span>
            <span>Tipe</span>
            <span>Progress</span>
            <span>Status</span>
            <span>Due ClickUp</span>
            <span>Milestone bayar</span>
            {canWriteStructure && <span>Aksi</span>}
          </div>
          {visibleItems.map((m) => {
            const depth = m.depth ?? (m.parent_id ? 1 : 0);
            const isChild =
              m.item_type === "subtask" ||
              depth >= 2 ||
              (!!m.parent_clickup_task_id && m.item_type !== "phase");
            const rowClass = [
              "timeline-detail-grid",
              "timeline-detail-grid--row",
              m.item_type === "phase" ? "timeline-detail-grid--phase" : "",
              m.clickup_only ? "timeline-row--clickup-only" : "",
              isChild ? "timeline-detail-grid--child" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={m.clickup_only ? `cu-${m.clickup_task_id}` : m.id}
                className={rowClass}
                role="row"
              >
                <div
                  className="timeline-detail-name"
                  style={{ paddingLeft: `${0.35 + depth * 1.1}rem` }}
                >
                  {m.item_type === "phase" && (
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label={collapsedPhases.has(m.id) ? "Expand phase" : "Collapse phase"}
                      onClick={() => togglePhase(m.id)}
                    >
                      {collapsedPhases.has(m.id) ? "▸" : "▾"}
                    </button>
                  )}
                  {m.expandable && m.clickup_task_id && m.item_type !== "phase" && (
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label="Expand task"
                      onClick={() => toggleCu(m.clickup_task_id!)}
                    >
                      {collapsedCu.has(m.clickup_task_id!) ? "▸" : "▾"}
                    </button>
                  )}
                  {isChild && <span className="task-recap-tree" aria-hidden />}
                  {canWriteStructure && !m.clickup_only && m.id > 0 ? (
                    <input
                      className="sph-inline-input"
                      defaultValue={m.name}
                      onBlur={async (e) => {
                        if (e.target.value.trim() === m.name) return;
                        await api(`/projects/${projectId}/milestones/${m.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ name: e.target.value.trim() }),
                        });
                        load();
                      }}
                    />
                  ) : m.clickup_url ? (
                    <a href={m.clickup_url} target="_blank" rel="noreferrer" className="task-recap-link">
                      {m.name}
                    </a>
                  ) : (
                    m.name
                  )}
                  {m.clickup_only && <span className="timeline-gantt-pro__cu-tag">ClickUp</span>}
                </div>
                <div>{m.module ?? "—"}</div>
                <div className="timeline-detail-date">{formatDisplayDate(m.start_date)}</div>
                <div className="timeline-detail-date">{formatDisplayDate(m.target_date)}</div>
                <div>
                  {m.display_duration_days != null
                    ? m.display_duration_days
                    : m.duration_days != null
                      ? m.duration_days
                      : "—"}
                </div>
                <div>{m.weight_pct}</div>
                <div>{itemTypePill(m.item_type)}</div>
                <div>
                  <ProgressBar pct={m.clickup_progress_pct} />
                </div>
                <div>
                  {m.clickup_status ? (
                    m.item_type === "phase" ? (
                      <span
                        className={`phase-status phase-status--${m.clickup_status.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        {m.clickup_status}
                      </span>
                    ) : (
                      <WorkflowStatusBadge
                        status={m.clickup_status}
                        raw={m.clickup_status_raw}
                        href={m.clickup_url}
                      />
                    )
                  ) : m.clickup_task_id ? (
                    <span className="text-muted">Belum sync</span>
                  ) : m.item_type === "phase" ? (
                    <span className="phase-status phase-status--not-started">NOT STARTED</span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="timeline-detail-date">{formatDisplayDate(m.clickup_due_date)}</div>
                <div>
                  {canWriteStructure && !m.clickup_only && m.id > 0 ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={!!m.is_payment_milestone}
                        onChange={() => togglePaymentMilestone(m)}
                      />{" "}
                      Termin
                    </label>
                  ) : m.is_payment_milestone ? (
                    "Ya"
                  ) : (
                    "—"
                  )}
                </div>
                {canWriteStructure && (
                  <div>
                    {!m.clickup_only && m.id > 0 ? (
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => removeMilestone(m.id, m.name)}
                      >
                        Hapus
                      </button>
                    ) : (
                      "—"
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}
      <div style={{ marginTop: "1.5rem" }} className="card">
        <h3 className="card-title">Rebaseline schedule</h3>
        <p className="text-muted">
          Aktifkan opsi rebaseline hanya jika diperlukan. Aturan: actual di bawah target dan RAG
          kuning/merah (baseline resmi tetap berlaku).
        </p>
        <label className="rebaseline-toggle">
          <input
            type="checkbox"
            checked={rebaselineOptIn}
            onChange={(e) => setRebaselineOptIn(e.target.checked)}
            disabled={!rebaselineEligible}
          />{" "}
          Enable rebaseline schedule
        </label>
        {!rebaselineEligible && (
          <p className="text-muted">Rebaseline belum memenuhi syarat untuk kondisi proyek saat ini.</p>
        )}
        {rebaselineEnabled && (
          <>
            <textarea
              placeholder="Alasan rebaseline"
              value={rebaseReason}
              onChange={(e) => setRebaseReason(e.target.value)}
            />
            <div className="btn-group">
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  const res = await api<{ id: number }>(
                    `/projects/${projectId}/rebaseline/request`,
                    {
                      method: "POST",
                      body: JSON.stringify({ reason: rebaseReason, proposed_changes: {} }),
                    },
                  );
                  setReqId(res.id);
                }}
              >
                Ajukan rebaseline
              </button>
              <button
                type="button"
                disabled={!reqId}
                onClick={async () => {
                  if (!reqId) return;
                  await api(`/projects/${projectId}/rebaseline/requests/${reqId}/client-ack`, {
                    method: "POST",
                    body: JSON.stringify({ client_acknowledged: true }),
                  });
                }}
              >
                Tandai kesepakatan klien
              </button>
            </div>
          </>
        )}
      </div>
      {canWriteStructure && (
        <form onSubmit={addMilestone} style={{ marginTop: "1.25rem" }}>
          <h3 className="card-title">Tambah milestone</h3>
          <div className="form-row">
            <label htmlFor="ms-name">Nama</label>
            <input
              id="ms-name"
              value={newRow.name}
              onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="ms-start">Tanggal mulai</label>
            <input
              id="ms-start"
              type="date"
              value={newRow.start_date}
              onChange={(e) => setNewRow({ ...newRow, start_date: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label htmlFor="ms-target">Tanggal target</label>
            <input
              id="ms-target"
              type="date"
              value={newRow.target_date}
              onChange={(e) => setNewRow({ ...newRow, target_date: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label htmlFor="ms-weight">Bobot %</label>
            <input
              id="ms-weight"
              type="number"
              min={0}
              step="0.1"
              value={newRow.weight_pct}
              onChange={(e) => setNewRow({ ...newRow, weight_pct: e.target.value })}
            />
          </div>
          <button type="submit" className="primary">
            Tambah milestone
          </button>
        </form>
      )}
    </div>
  );
}

type PaymentTermRow = {
  label: string;
  due_date: string;
  percent_pct: string;
  draft_milestone_id: string;
  draft_milestone_row_key: string;
};

function mapPaymentTermsFromApi(
  terms: {
    label?: string;
    due_date?: string | null;
    percent_pct?: number | null;
    draft_milestone_id?: number | null;
    draft_milestone_row_key?: string | null;
  }[],
): PaymentTermRow[] {
  return (terms ?? []).map((t) => ({
    label: t.label ?? "",
    due_date: toDateInputValue(t.due_date),
    percent_pct: t.percent_pct != null ? String(t.percent_pct) : "",
    draft_milestone_id:
      t.draft_milestone_id != null ? String(t.draft_milestone_id) : "",
    draft_milestone_row_key: t.draft_milestone_row_key ?? "",
  }));
}
type LineItemRow = { id: string; text: string; module?: string };
type DeliveryItemRow = { id: string; name: string; amount_rupiah: string };

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function parseRupiahDigits(s: string) {
  return Number(String(s).replace(/\D/g, "")) || 0;
}

function formatRupiahDigits(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}

function SphLineList({
  items,
  setItems,
  placeholder,
  showModule,
}: {
  items: LineItemRow[];
  setItems: (v: LineItemRow[]) => void;
  placeholder: string;
  showModule?: boolean;
}) {
  return (
    <div className="sph-list-panel">
      {items.length === 0 ? (
        <p className="sph-list-empty">Belum ada item. Tambahkan baris scope di bawah.</p>
      ) : showModule ? (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "3rem" }}>#</th>
              <th style={{ width: "10rem" }}>Modul</th>
              <th>Use case / scope</th>
              <th style={{ width: "3rem" }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="text-muted">{index + 1}</td>
                <td>
                  <input
                    className="sph-inline-input"
                    value={item.module ?? ""}
                    placeholder="Modul"
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...next[index], module: e.target.value };
                      setItems(next);
                    }}
                  />
                </td>
                <td>
                  <textarea
                    className="sph-list-text"
                    rows={2}
                    value={item.text}
                    placeholder={placeholder}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...next[index], text: e.target.value };
                      setItems(next);
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-icon-danger"
                    aria-label="Hapus item"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="sph-list-rows">
          {items.map((item, index) => (
            <div key={item.id} className="sph-list-row">
              <span className="sph-list-index">{index + 1}</span>
              <textarea
                className="sph-list-text"
                rows={2}
                value={item.text}
                placeholder={placeholder}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], text: e.target.value };
                  setItems(next);
                }}
              />
              <button
                type="button"
                className="btn-icon-danger"
                title="Hapus item"
                aria-label="Hapus item"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn-add-row"
        onClick={() =>
          setItems([
            ...items,
            { id: newId(), text: "", ...(showModule ? { module: "" } : {}) },
          ])
        }
      >
        + Tambah item
      </button>
    </div>
  );
}

type DraftTimelineRow = {
  id?: number;
  row_key?: string;
  name: string;
  duration_days: number;
  weight_pct: number;
  start_date?: string | null;
  target_date?: string | null;
  item_type: string;
  parent_id?: number | null;
  parent_ref?: string | null;
  sort_order: number;
  notes?: string | null;
};

function normalizeDraftSortOrder(rows: DraftTimelineRow[]): DraftTimelineRow[] {
  return rows.map((r, i) => ({ ...r, sort_order: i }));
}

function moveDraftRow(
  rows: DraftTimelineRow[],
  index: number,
  direction: -1 | 1,
): DraftTimelineRow[] {
  const j = index + direction;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[j]] = [next[j], next[index]];
  return normalizeDraftSortOrder(next);
}

function syncPaymentTermsFromDraft(
  draft: DraftTimelineRow[],
  terms: PaymentTermRow[],
): PaymentTermRow[] {
  const byId = new Map(
    draft.filter((d) => d.id != null).map((d) => [String(d.id), d]),
  );
  const byKey = new Map(
    draft.filter((d) => d.row_key).map((d) => [String(d.row_key), d]),
  );
  const byName = new Map(
    draft.map((d) => [d.name.trim().toLowerCase(), d]),
  );
  return terms.map((t) => {
    let hit: DraftTimelineRow | undefined;
    if (t.draft_milestone_row_key) hit = byKey.get(t.draft_milestone_row_key);
    if (!hit && t.draft_milestone_id) hit = byId.get(t.draft_milestone_id);
    if (!hit && t.label.trim()) hit = byName.get(t.label.trim().toLowerCase());
    if (!hit?.target_date && !hit?.id) return t;
    return {
      ...t,
      draft_milestone_id: hit.id != null ? String(hit.id) : t.draft_milestone_id,
      draft_milestone_row_key: hit.row_key ?? t.draft_milestone_row_key,
      due_date: hit.target_date ? toDateInputValue(hit.target_date) : t.due_date,
      label: t.label.trim() || hit.name || t.label,
    };
  });
}

function draftRowsWithParentRefs(rows: DraftTimelineRow[]): DraftTimelineRow[] {
  const idToKey: Record<number, string> = {};
  for (const r of rows) {
    if (r.id != null && r.row_key) idToKey[r.id] = r.row_key;
  }
  return rows.map((r) => ({
    ...r,
    parent_ref:
      r.parent_ref ?? (r.parent_id != null ? idToKey[r.parent_id] ?? null : null),
  }));
}

function DraftTimelineTable({
  canEdit,
  draftTimeline,
  setDraftTimeline,
  onSave,
}: {
  canEdit: boolean;
  draftTimeline: DraftTimelineRow[];
  setDraftTimeline: (rows: DraftTimelineRow[]) => void;
  onSave: () => void | Promise<void>;
}) {
  const weightCheck = useMemo(
    () => validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    [draftTimeline],
  );

  const handleSave = () => {
    const err = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (err) {
      window.alert(err);
      return;
    }
    void onSave();
  };

  if (draftTimeline.length === 0) return null;
  return (
    <>
      <div
        className={`timeline-weight-summary${weightCheck.ok ? " timeline-weight-summary--ok" : " timeline-weight-summary--warn"}`}
        role="status"
      >
        <p className="timeline-weight-summary__line">
          Total bobot phase (root):{" "}
          <strong>{weightCheck.rootTotal.toFixed(1)}%</strong>
          <span className="text-muted"> / 100%</span>
          {weightCheck.ok ? (
            <span className="timeline-weight-summary__badge timeline-weight-summary__badge--ok">
              Valid
            </span>
          ) : (
            <span className="timeline-weight-summary__badge timeline-weight-summary__badge--warn">
              Perlu perbaikan
            </span>
          )}
        </p>
        {!weightCheck.ok && (
          <ul className="timeline-weight-summary__issues">
            {weightCheck.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <p className="text-muted timeline-weight-summary__hint">
          Aturan: total phase root = 100%; jumlah bobot anak (task/subtask) = bobot parent (±0,5%).
        </p>
      </div>
      <div className="table-scroll">
        <table className="data-table data-table--timeline">
          <thead>
            <tr>
              {canEdit && <th className="timeline-col-order">Urutan</th>}
              <th>Nama</th>
              <th>Catatan / deskripsi</th>
              <th>Durasi (hari kerja)</th>
              <th>Mulai</th>
              <th>Selesai</th>
              <th>Parent</th>
              <th>Tipe</th>
              <th>Bobot %</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {draftTimeline.map((row, index) => (
              <tr key={row.id ?? row.row_key ?? index}>
                {canEdit && (
                  <td className="timeline-col-order">
                    <div className="timeline-order-btns">
                      <button
                        type="button"
                        className="timeline-order-btn"
                        title="Naikkan"
                        disabled={index === 0}
                        aria-label="Naikkan baris"
                        onClick={() =>
                          setDraftTimeline(moveDraftRow(draftTimeline, index, -1))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="timeline-order-btn"
                        title="Turunkan"
                        disabled={index === draftTimeline.length - 1}
                        aria-label="Turunkan baris"
                        onClick={() =>
                          setDraftTimeline(moveDraftRow(draftTimeline, index, 1))
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                )}
                <td>
                  <input
                    className="sph-inline-input"
                    value={row.name}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      const next = [...draftTimeline];
                      next[index] = { ...next[index], name: e.target.value };
                      setDraftTimeline(next);
                    }}
                  />
                </td>
                <td className="timeline-col-notes">
                  <input
                    className="sph-inline-input sph-inline-input--notes"
                    value={row.notes ?? ""}
                    readOnly={!canEdit}
                    placeholder="Opsional"
                    onChange={(e) => {
                      const next = [...draftTimeline];
                      next[index] = { ...next[index], notes: e.target.value };
                      setDraftTimeline(next);
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="sph-inline-input"
                    disabled={row.item_type === "milestone"}
                    value={row.item_type === "milestone" ? 0 : row.duration_days}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      const next = [...draftTimeline];
                      next[index] = {
                        ...next[index],
                        duration_days: Number(e.target.value) || 1,
                      };
                      setDraftTimeline(next);
                    }}
                  />
                </td>
                <td>
                  <span className="cell-date">{formatDisplayDate(row.start_date)}</span>
                </td>
                <td>
                  {row.item_type === "milestone" && canEdit ? (
                    <input
                      type="date"
                      className="sph-inline-input"
                      value={toDateInputValue(row.target_date)}
                      onChange={(e) => {
                        const next = [...draftTimeline];
                        next[index] = {
                          ...next[index],
                          target_date: e.target.value || null,
                          start_date: e.target.value || null,
                        };
                        setDraftTimeline(next);
                      }}
                    />
                  ) : (
                    <span className="cell-date">{formatDisplayDate(row.target_date)}</span>
                  )}
                </td>
                <td>
                  {canEdit ? (
                    <select
                      value={row.parent_ref ?? ""}
                      onChange={(e) => {
                        const next = [...draftTimeline];
                        next[index] = {
                          ...next[index],
                          parent_ref: e.target.value || null,
                        };
                        setDraftTimeline(next);
                      }}
                    >
                      <option value="">— root —</option>
                      {draftTimeline
                        .filter((_, i) => i !== index)
                        .map((p, pi) => (
                          <option
                            key={p.row_key ?? p.id ?? pi}
                            value={p.row_key || String(p.id ?? pi)}
                          >
                            {p.name} ({p.item_type})
                          </option>
                        ))}
                    </select>
                  ) : (
                    (row.parent_ref ?? "—")
                  )}
                </td>
                <td>
                  {canEdit ? (
                    <select
                      value={row.item_type}
                      onChange={(e) => {
                        const t = e.target.value;
                        const next = [...draftTimeline];
                        next[index] = {
                          ...next[index],
                          item_type: t,
                          ...(t === "milestone" ? { weight_pct: 0, duration_days: 0 } : {}),
                        };
                        setDraftTimeline(next);
                      }}
                    >
                      <option value="phase">phase</option>
                      <option value="task">task</option>
                      <option value="subtask">subtask</option>
                      <option value="milestone">milestone</option>
                    </select>
                  ) : (
                    row.item_type
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    className="sph-inline-input"
                    value={row.item_type === "milestone" ? 0 : row.weight_pct}
                    readOnly={!canEdit || row.item_type === "milestone"}
                    onChange={(e) => {
                      const next = [...draftTimeline];
                      next[index] = {
                        ...next[index],
                        weight_pct: Number(e.target.value) || 0,
                      };
                      setDraftTimeline(next);
                    }}
                  />
                </td>
                {canEdit && (
                  <td>
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() =>
                        setDraftTimeline(
                          normalizeDraftSortOrder(
                            draftTimeline.filter((_, i) => i !== index),
                          ),
                        )
                      }
                    >
                      Hapus
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="ui-toolbar">
          <button
            type="button"
            className="btn-add-row"
            onClick={() =>
              setDraftTimeline(
                normalizeDraftSortOrder([
                  ...draftTimeline,
                  {
                    name: "Baru",
                    duration_days: 1,
                    weight_pct: 0,
                    item_type: "task",
                    parent_ref: null,
                    sort_order: draftTimeline.length,
                    row_key: `row_${newId().slice(0, 8)}`,
                    notes: "",
                  },
                ]),
              )
            }
          >
            + Tambah baris timeline
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            Simpan & hitung ulang tanggal
          </button>
        </div>
      )}
    </>
  );
}

function SphTab({
  projectId,
  projectMethodology,
  timelineEditable,
  readOnlyPhase,
  onMethodologyChange,
  onDraftTimelineChanged,
  onAdvanceToKickOff,
  onProjectRefresh,
}: {
  projectId: number;
  projectMethodology: string;
  timelineEditable: boolean;
  readOnlyPhase?: boolean;
  onMethodologyChange?: () => void;
  onDraftTimelineChanged?: () => void;
  onAdvanceToKickOff?: () => void;
  onProjectRefresh?: () => void;
}) {
  const [form, setForm] = useState({
    sph_no: "",
    sph_name: "",
    sph_client: "",
    sales_pic: "",
    estimated_start_date: "",
    target_delivery_days: "",
    delivery_method: "",
    pic_user_name: "",
    pic_user_contact: "",
    planned_md: "",
  });
  const [isComplete, setIsComplete] = useState(false);
  const [draftTimeline, setDraftTimeline] = useState<DraftTimelineRow[]>([]);
  const [sphReadOnly, setSphReadOnly] = useState(false);
  const canEditSph = timelineEditable && !sphReadOnly && !readOnlyPhase;
  const [templates, setTemplates] = useState<
    { id: number; name: string; methodology: string }[]
  >([]);
  const [timelineTemplateId, setTimelineTemplateId] = useState("");
  const [methodology, setMethodology] = useState(projectMethodology);
  const [scopeItems, setScopeItems] = useState<LineItemRow[]>([]);
  const [nonScopeItems, setNonScopeItems] = useState<LineItemRow[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [sphTotal, setSphTotal] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermRow[]>([]);
  const [projectBrief, setProjectBrief] = useState("");
  const [msg, setMsg] = useState("");
  const load = () =>
    api<{
      sph_no: string | null;
      sph_name: string | null;
      sph_client: string | null;
      sales_pic: string | null;
      estimated_start_date: string | null;
      target_delivery_days: number | null;
      scope_text: string;
      non_scope_text: string;
      scope_items: { id?: string; module?: string; text: string }[];
      non_scope_items: { id?: string; text: string }[];
      delivery_items: { id?: string; name: string; amount_rupiah: number }[];
      sph_total_rupiah: number | null;
      delivery_method: string;
      pic_user_name: string;
      pic_user_contact: string;
      planned_md: number | null;
      timeline_template_id: number | null;
      draft_timeline: DraftTimelineRow[];
      is_complete: boolean;
      draft_baseline_generated_at?: string | null;
      payment_terms: {
        label?: string;
        due_date?: string | null;
        percent_pct?: number | null;
        amount?: number | null;
        draft_milestone_id?: number | null;
      }[];
    }>(`/projects/${projectId}/sph`).then((s) => {
      setIsComplete(!!s.is_complete);
      setSphReadOnly(!!s.draft_baseline_generated_at);
      const rawDraft = (s.draft_timeline ?? []).map((r, idx) => ({
        ...r,
        duration_days: r.duration_days ?? 1,
        item_type: r.item_type ?? "phase",
        sort_order: r.sort_order ?? idx,
      }));
      setDraftTimeline(draftRowsWithParentRefs(rawDraft));
      setTimelineTemplateId(
        s.timeline_template_id != null ? String(s.timeline_template_id) : "",
      );
      setForm({
        sph_no: s.sph_no ?? "",
        sph_name: s.sph_name ?? "",
        sph_client: s.sph_client ?? "",
        sales_pic: s.sales_pic ?? "",
        estimated_start_date: toDateInputValue(s.estimated_start_date),
        target_delivery_days: s.target_delivery_days?.toString() ?? "",
        delivery_method: s.delivery_method ?? "",
        pic_user_name: s.pic_user_name ?? "",
        pic_user_contact: s.pic_user_contact ?? "",
        planned_md: s.planned_md?.toString() ?? "",
      });
      const toLines = (
        items: { id?: string; module?: string; text: string }[],
        fallback: string,
        withModule?: boolean,
      ) => {
        if (items?.length) {
          return items.map((i) => ({
            id: i.id || newId(),
            text: i.text,
            ...(withModule ? { module: i.module ?? "" } : {}),
          }));
        }
        if (fallback.trim()) {
          return fallback
            .split("\n")
            .map((line) => line.replace(/^-\s*/, "").trim())
            .filter(Boolean)
            .map((text) => ({ id: newId(), text }));
        }
        return [];
      };
      setScopeItems(toLines(s.scope_items ?? [], s.scope_text ?? "", true));
      setNonScopeItems(toLines(s.non_scope_items ?? [], s.non_scope_text ?? ""));
      setDeliveryItems(
        (s.delivery_items ?? []).map((d) => ({
          id: d.id || newId(),
          name: d.name,
          amount_rupiah: formatRupiahDigits(d.amount_rupiah ?? 0),
        })),
      );
      setSphTotal(s.sph_total_rupiah ?? 0);
      setPaymentTerms(mapPaymentTermsFromApi(s.payment_terms ?? []));
    });
  useEffect(() => {
    api<{ project_brief?: string | null }>(`/projects/${projectId}`)
      .then((p) => setProjectBrief(p.project_brief ?? ""))
      .catch(() => setProjectBrief(""));
  }, [projectId]);

  useEffect(() => {
    setMethodology(projectMethodology);
  }, [projectMethodology]);
  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
    api<typeof templates>(`/timeline-templates?methodology=${methodology}`)
      .then(setTemplates)
      .catch(() => {});
  }, [projectId, methodology]);
  const saveMethodology = async (value: string) => {
    setMethodology(value);
    await api(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ methodology: value }),
    });
    onMethodologyChange?.();
  };
  const saveDraftTimeline = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      const rowsPayload = draftRowsWithParentRefs(draftTimeline);
      const res = await api<{
        draft_timeline: DraftTimelineRow[];
        payment_terms?: {
          label?: string;
          due_date?: string | null;
          percent_pct?: number | null;
          draft_milestone_id?: number | null;
          draft_milestone_row_key?: string | null;
        }[];
      }>(`/projects/${projectId}/sph/draft-timeline`, {
        method: "PUT",
        body: JSON.stringify({
          start_date: form.estimated_start_date || null,
          rows: rowsPayload.map((r, idx) => ({
            id: r.id,
            row_key: r.row_key || String(r.id || idx),
            name: r.name,
            duration_days: r.item_type === "milestone" ? 0 : r.duration_days,
            weight_pct: r.item_type === "milestone" ? 0 : r.weight_pct,
            item_type: r.item_type,
            parent_ref: r.parent_ref || null,
            parent_id: r.parent_id ?? null,
            target_date: r.item_type === "milestone" ? r.target_date : undefined,
            sort_order: idx,
            notes: (r.notes ?? "").trim() || null,
          })),
        }),
      });
      const mappedDraft = draftRowsWithParentRefs(res.draft_timeline);
      setDraftTimeline(mappedDraft);
      if (res.payment_terms !== undefined) {
        setPaymentTerms(mapPaymentTermsFromApi(res.payment_terms));
      } else if (
        paymentTerms.some((t) => t.draft_milestone_id || t.draft_milestone_row_key)
      ) {
        setPaymentTerms(syncPaymentTermsFromDraft(mappedDraft, paymentTerms));
      }
      setMsg("Draft timeline disimpan. Termin ter-map ikut diperbarui.");
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      await api(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ project_brief: projectBrief.trim() || null }),
      });
      await api(`/projects/${projectId}/sph`, {
        method: "PUT",
        body: JSON.stringify({
          sph_no: form.sph_no.trim() || null,
          sph_name: form.sph_name.trim() || null,
          sph_client: form.sph_client.trim() || null,
          sales_pic: form.sales_pic.trim() || null,
          estimated_start_date: form.estimated_start_date || null,
          target_delivery_days: form.target_delivery_days
            ? Number(form.target_delivery_days)
            : null,
          scope_items: scopeItems
            .filter((i) => i.text.trim())
            .map(({ id, text, module }) => ({
              id,
              module: (module ?? "").trim(),
              text: text.trim(),
            })),
          non_scope_items: nonScopeItems
            .filter((i) => i.text.trim())
            .map(({ id, text }) => ({ id, text: text.trim() })),
          delivery_items: deliveryItems
            .filter((i) => i.name.trim())
            .map(({ id, name, amount_rupiah }) => ({
              id,
              name: name.trim(),
              amount_rupiah: parseRupiahDigits(amount_rupiah),
            })),
          delivery_method: form.delivery_method,
          pic_user_name: form.pic_user_name,
          pic_user_contact: form.pic_user_contact,
          planned_md: form.planned_md ? Number(form.planned_md) : null,
          timeline_template_id: timelineTemplateId ? Number(timelineTemplateId) : null,
        }),
      });
      setMsg("SPH disimpan.");
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const savePaymentTerms = async () => {
    setMsg("");
    try {
      await api(`/projects/${projectId}/sph/payment-terms`, {
        method: "PUT",
        body: JSON.stringify({
          payment_terms: paymentTerms.map((t) => ({
            label: t.label.trim(),
            due_date: t.due_date || null,
            percent_pct: t.percent_pct !== "" ? Number(t.percent_pct) : null,
            draft_milestone_id: t.draft_milestone_id
              ? Number(t.draft_milestone_id)
              : null,
            draft_milestone_row_key: t.draft_milestone_row_key.trim() || null,
          })),
        }),
      });
      setMsg("Termin pembayaran disimpan.");
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const addPaymentTerm = () => {
    setPaymentTerms([
      ...paymentTerms,
      {
        label: "",
        due_date: "",
        percent_pct: "",
        draft_milestone_id: "",
        draft_milestone_row_key: "",
      },
    ]);
  };
  const removePaymentTerm = (index: number) => {
    setPaymentTerms(paymentTerms.filter((_, i) => i !== index));
  };
  const deliveryTotal = deliveryItems.reduce(
    (sum, row) => sum + parseRupiahDigits(row.amount_rupiah),
    0,
  );
  const termAmount = (percent: string) => {
    const base = sphTotal || deliveryTotal;
    const p = Number(percent);
    if (!base || !p) return "—";
    return formatRupiah(Math.round((base * p) / 100));
  };
  const hasTimelineStart = !!form.estimated_start_date.trim();
  const persistTimelinePlanning = async () => {
    if (!canEditSph) return;
    const targetDays = form.target_delivery_days
      ? Number(form.target_delivery_days)
      : null;
    await api(`/projects/${projectId}/sph`, {
      method: "PUT",
      body: JSON.stringify({
        estimated_start_date: form.estimated_start_date || null,
        target_delivery_days: targetDays,
        timeline_template_id: timelineTemplateId ? Number(timelineTemplateId) : null,
      }),
    });
  };
  const generateDraftFromTemplate = async () => {
    setMsg("");
    if (!hasTimelineStart) {
      setMsg("[Data tidak valid] Isi estimasi mulai proyek di bagian timeline terlebih dahulu.");
      return;
    }
    try {
      await persistTimelinePlanning();
      await api(`/projects/${projectId}/sph/generate-draft-timeline`, {
        method: "POST",
        body: JSON.stringify({
          start_date: form.estimated_start_date,
          timeline_template_id: timelineTemplateId ? Number(timelineTemplateId) : null,
        }),
      });
      setMsg(
        form.target_delivery_days
          ? `Draft timeline dibuat — durasi disesuaikan ke target ${form.target_delivery_days} hari kerja (phase root).`
          : "Draft timeline dari template dibuat. Isi durasi target lalu generate ulang jika perlu skala total proyek.",
      );
      load();
      onDraftTimelineChanged?.();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const finalizeTimelineForKickoff = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      await api<{ current_phase?: string }>(
        `/projects/${projectId}/sph/generate-timeline`,
        { method: "POST" },
      );
      setMsg("Fase Kick Off — timeline draft tersedia di tab Kick Off. SPH hanya baca.");
      load();
      onProjectRefresh?.();
      onAdvanceToKickOff?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card card--sph">
      <h2 className="card-title">SPH & PO</h2>
      <TabAlert message={msg} />
      {!canEditSph && <TabReadOnlyNotice message={TAB_READONLY_MSG.sph} />}
      <form onSubmit={save}>
        <fieldset disabled={!canEditSph} className="sph-fieldset">
        <section className="sph-info-panel" aria-labelledby="sph-info-heading">
          <h3 id="sph-info-heading" className="sph-info-panel__title">
            Informasi SPH
          </h3>
          <div className="sph-info-grid">
            <div className="form-row sph-info-grid__full">
              <label htmlFor="sph-no">No SPH</label>
              <input
                id="sph-no"
                className="sph-info-input"
                value={form.sph_no}
                onChange={(e) => setForm({ ...form, sph_no: e.target.value })}
              />
            </div>
            <div className="form-row sph-info-grid__full">
              <label htmlFor="project-brief">Project brief</label>
              <textarea
                id="project-brief"
                className="sph-info-input"
                rows={4}
                placeholder="Ringkasan proyek untuk overview laporan (weekly report PPTX)"
                value={projectBrief}
                onChange={(e) => setProjectBrief(e.target.value)}
              />
              <p className="form-hint" style={{ margin: "0.35rem 0 0" }}>
                Dipakai di halaman Overview PPTX. Jika kosong, sistem memakai scope SPH.
              </p>
            </div>
            <div className="form-row">
              <label htmlFor="sph-name">SPH name</label>
              <input
                id="sph-name"
                className="sph-info-input"
                value={form.sph_name}
                onChange={(e) => setForm({ ...form, sph_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-client">Klien name</label>
              <input
                id="sph-client"
                className="sph-info-input"
                value={form.sph_client}
                onChange={(e) => setForm({ ...form, sph_client: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sales-pic">Sales PIC</label>
              <input
                id="sales-pic"
                className="sph-info-input"
                value={form.sales_pic}
                onChange={(e) => setForm({ ...form, sales_pic: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-delivery_method">Delivery method</label>
              <input
                id="sph-delivery_method"
                className="sph-info-input"
                value={form.delivery_method}
                onChange={(e) => setForm({ ...form, delivery_method: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-pic_user_name">PIC name</label>
              <input
                id="sph-pic_user_name"
                className="sph-info-input"
                value={form.pic_user_name}
                onChange={(e) => setForm({ ...form, pic_user_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-pic_user_contact">PIC contact</label>
              <input
                id="sph-pic_user_contact"
                className="sph-info-input"
                value={form.pic_user_contact}
                onChange={(e) => setForm({ ...form, pic_user_contact: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-planned_md">Planned MD (SPH)</label>
              <input
                id="sph-planned_md"
                className="sph-info-input"
                inputMode="numeric"
                value={form.planned_md}
                onChange={(e) => setForm({ ...form, planned_md: e.target.value })}
              />
            </div>
          </div>
        </section>
        <h3 className="subsection-title">Scope of work (SOW)</h3>
        <SphLineList
          items={scopeItems}
          setItems={setScopeItems}
          placeholder="Use case / item scope..."
          showModule
        />
        <h3 className="subsection-title">Non scope</h3>
        <SphLineList
          items={nonScopeItems}
          setItems={setNonScopeItems}
          placeholder="Item di luar scope..."
        />
        <h3 className="subsection-title">Item delivery</h3>
        <p className="text-muted">Total SPH dihitung dari jumlah nilai item delivery.</p>
        <div className="sph-list-panel">
          {deliveryItems.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "3rem" }}>#</th>
                  <th>Item delivery</th>
                  <th style={{ width: "12rem" }}>Nilai (Rp)</th>
                  <th style={{ width: "3rem" }} />
                </tr>
              </thead>
              <tbody>
                {deliveryItems.map((row, index) => (
                  <tr key={row.id}>
                    <td className="text-muted">{index + 1}</td>
                    <td>
                      <input
                        className="sph-inline-input"
                        value={row.name}
                        placeholder="Nama item / deliverable"
                        onChange={(e) => {
                          const next = [...deliveryItems];
                          next[index] = { ...next[index], name: e.target.value };
                          setDeliveryItems(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="sph-inline-input"
                        inputMode="numeric"
                        value={row.amount_rupiah}
                        placeholder="0"
                        onChange={(e) => {
                          const next = [...deliveryItems];
                          next[index] = {
                            ...next[index],
                            amount_rupiah: formatRupiahDigits(parseRupiahDigits(e.target.value)),
                          };
                          setDeliveryItems(next);
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        aria-label="Hapus"
                        onClick={() =>
                          setDeliveryItems(deliveryItems.filter((_, i) => i !== index))
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            className="btn-add-row"
            onClick={() =>
              setDeliveryItems([
                ...deliveryItems,
                { id: newId(), name: "", amount_rupiah: "" as string },
              ])
            }
          >
            + Tambah item delivery
          </button>
          <p className="sph-total-line">
            Total SPH: <strong>{formatRupiah(sphTotal || deliveryTotal)}</strong>
          </p>
        </div>
        <button type="submit" className="primary">
          Simpan SPH
        </button>
        </fieldset>
      </form>
      <hr className="card-divider" />
      <section className="ui-section" aria-labelledby="sph-timeline-heading">
        <div className="ui-section__head">
          <h3 id="sph-timeline-heading" className="ui-section__title">
            Timeline (template & draft)
          </h3>
          <p className="ui-section__desc">
            Durasi hari kerja; mulai/selesai dihitung dari estimasi mulai proyek dan kalender
            organisasi. <strong>Durasi target (hari)</strong> menskalakan template saat{" "}
            <strong>Generate draft dari template</strong> (total phase root ≈ target). Edit baris
            lalu simpan sebelum fase Kick Off.
          </p>
        </div>
        {!canEditSph && draftTimeline.length > 0 && (
          <p className="text-muted">Timeline SPH read-only — ditampilkan untuk referensi.</p>
        )}
        <div className="form-grid-2">
          <div className="form-row">
            <label htmlFor="sph-start">Estimasi mulai proyek</label>
            <input
              id="sph-start"
              type="date"
              disabled={!canEditSph}
              value={form.estimated_start_date}
              onChange={(e) => setForm({ ...form, estimated_start_date: e.target.value })}
              onBlur={() => {
                if (!canEditSph) return;
                persistTimelinePlanning().catch((e) => setMsg(getErrorMessage(e)));
                if (draftTimeline.length > 0) {
                  saveDraftTimeline();
                }
              }}
            />
          </div>
          <div className="form-row">
            <label htmlFor="sph-days">Durasi target (hari)</label>
            <input
              id="sph-days"
              type="number"
              min={1}
              disabled={!canEditSph}
              value={form.target_delivery_days}
              onChange={(e) => setForm({ ...form, target_delivery_days: e.target.value })}
              onBlur={() => {
                if (!canEditSph) return;
                persistTimelinePlanning()
                  .then(() => {
                    if (draftTimeline.length > 0) {
                      return load();
                    }
                  })
                  .catch((e) => setMsg(getErrorMessage(e)));
              }}
            />
          </div>
          <div className="form-row">
            <label>Tipe proyek</label>
            <select
              value={methodology}
              disabled={!canEditSph}
              onChange={(e) => saveMethodology(e.target.value)}
            >
              <option value="waterfall">Waterfall</option>
              <option value="hybrid">Hybrid</option>
              <option value="agile">Agile</option>
            </select>
          </div>
          <div className="form-row">
            <label>Template timeline</label>
            <select
              value={timelineTemplateId}
              onChange={(e) => setTimelineTemplateId(e.target.value)}
              disabled={!canEditSph}
            >
              <option value="">— Default metodologi —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ui-toolbar">
          <button
            type="button"
            className="primary"
            disabled={!canEditSph || !hasTimelineStart}
            title={
              hasTimelineStart
                ? "Isi dari template + tipe proyek"
                : "Isi estimasi mulai proyek terlebih dahulu"
            }
            onClick={generateDraftFromTemplate}
          >
            Generate draft dari template
          </button>
        </div>
        {draftTimeline.length === 0 && canEditSph && (
          <p className="text-muted">
            {hasTimelineStart
              ? "Pilih tipe proyek dan template, lalu generate draft."
              : "Isi estimasi mulai proyek — wajib sebelum generate draft dari template."}
          </p>
        )}
        {draftTimeline.length > 0 && (
          <DraftTimelineTable
            canEdit={canEditSph}
            draftTimeline={draftTimeline}
            setDraftTimeline={setDraftTimeline}
            onSave={saveDraftTimeline}
          />
        )}
      </section>
      <hr className="card-divider" />
      <section className="ui-section">
        <fieldset disabled={!canEditSph} className="sph-fieldset">
        <h3 className="ui-section__title">Term of payment</h3>
        <p className="ui-section__desc">
          Termin ter-map ke milestone draft mengikuti tanggal timeline setelah simpan & hitung
          ulang.
        </p>
        <p>
          Total SPH: <strong>{formatRupiah(sphTotal || deliveryTotal)}</strong>
        </p>
        {paymentTerms.length === 0 ? (
          <p className="text-muted">Belum ada termin.</p>
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Milestone (draft)</th>
                <th>Jatuh tempo</th>
                <th>%</th>
                <th>Nilai (Rp)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paymentTerms.map((row, index) => (
                <tr key={`pt-${index}`}>
                  <td>
                    <input
                      value={row.label}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        next[index] = { ...next[index], label: e.target.value };
                        setPaymentTerms(next);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={row.draft_milestone_id}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        const id = e.target.value;
                        const hit = draftTimeline.find((d) => String(d.id) === id);
                        next[index] = {
                          ...next[index],
                          draft_milestone_id: id,
                          draft_milestone_row_key: hit?.row_key ?? "",
                          due_date: hit?.target_date
                            ? toDateInputValue(hit.target_date)
                            : next[index].due_date,
                          label: next[index].label || hit?.name || "",
                        };
                        setPaymentTerms(next);
                      }}
                    >
                      <option value="">— Manual —</option>
                      {draftTimeline.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {d.target_date ? ` (${formatDisplayDate(d.target_date)})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="sph-inline-input"
                      value={toDateInputValue(row.due_date)}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        next[index] = { ...next[index], due_date: e.target.value };
                        setPaymentTerms(next);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={row.percent_pct}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        next[index] = { ...next[index], percent_pct: e.target.value };
                        setPaymentTerms(next);
                      }}
                    />
                  </td>
                  <td>{termAmount(row.percent_pct)}</td>
                  <td>
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() => removePaymentTerm(index)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <div className="ui-toolbar">
          <button type="button" className="btn-add-row" onClick={addPaymentTerm}>
            Tambah termin
          </button>
          <button type="button" className="primary" onClick={savePaymentTerms}>
            Simpan termin pembayaran
          </button>
        </div>
        </fieldset>
      </section>
      <div className="ui-toolbar" style={{ marginTop: "0.25rem" }}>
        <button
          type="button"
          className="primary"
          disabled={!isComplete || !canEditSph || draftTimeline.length === 0}
          title={
            isComplete
              ? "SPH lengkap + draft + termin → lanjut Kick Off"
              : "Lengkapi SPH, draft timeline, dan termin pembayaran"
          }
          onClick={finalizeTimelineForKickoff}
        >
          Lanjut ke fase berikutnya «Kick Off»
        </button>
      </div>
      <p className="text-muted">
        Tombol «Kick Off» aktif jika SPH lengkap, draft timeline ada, dan termin pembayaran
        disimpan. PO opsional sampai Closing Project.
      </p>
      <TabDocumentUpload
        projectId={projectId}
        docType="sph"
        phase="po_received"
        title="Dokumen SPH"
        hint="PDF/Office/image — tampil di sini dan tab Documents. Jika folder GDrive proyek sudah di-set, file juga disalin ke Drive (butuh service account di server)."
        readOnly={!canEditSph}
      />
    </div>
  );
}

type OrgNode = { role: string; name: string; level: number };

function parseOrgLine(trimmed: string): { role: string; name: string } {
  const em = trimmed.match(/^(.+?)\s*[—–]\s*(.+)$/);
  if (em) return { role: em[1].trim(), name: em[2].trim() };
  const hy = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (hy) return { role: hy[1].trim(), name: hy[2].trim() };
  const tight = trimmed.match(/^([^\s-]+)-\s*(.+)$/);
  if (tight) return { role: tight[1].trim(), name: tight[2].trim() };
  return { role: trimmed, name: "" };
}

function parseOrgText(raw: string): OrgNode[] {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim());
  const indentCols = lines
    .map((line) => line.search(/\S/))
    .filter((c) => c >= 0);
  const uniqueIndents = [...new Set(indentCols)].sort((a, b) => a - b);
  const levelForCol = (col: number) => {
    const idx = uniqueIndents.indexOf(col);
    return idx >= 0 ? idx : 0;
  };
  return lines.map((line) => {
    const col = line.search(/\S/);
    const { role, name } = parseOrgLine(line.trim());
    return { role, name, level: levelForCol(col) };
  });
}

type OrgTreeNode = OrgNode & { children: OrgTreeNode[] };

function buildOrgTree(nodes: OrgNode[]): OrgTreeNode[] {
  const roots: OrgTreeNode[] = [];
  const stack: { level: number; node: OrgTreeNode }[] = [];
  for (const n of nodes) {
    const item: OrgTreeNode = { ...n, children: [] };
    while (stack.length && stack[stack.length - 1].level >= n.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(item);
    } else {
      stack[stack.length - 1].node.children.push(item);
    }
    stack.push({ level: n.level, node: item });
  }
  return roots;
}

function OrgTreeTopDown({ node }: { node: OrgTreeNode }) {
  const hasKids = node.children.length > 0;
  return (
    <div className="org-td-node">
      <div className="org-node-card org-node-card--topdown">
        <span className="org-role">{node.role}</span>
        {node.name ? <span className="org-name">{node.name}</span> : null}
      </div>
      {hasKids && (
        <div className="org-td-sub">
          <div className="org-td-vline org-td-vline--parent" aria-hidden />
          <div className="org-td-children-rail">
            <div className="org-td-hrail" aria-hidden />
            <div className="org-td-row">
              {node.children.map((c, i) => (
                <div key={`${c.role}-${c.name}-${i}`} className="org-td-branch">
                  <div className="org-td-vline org-td-vline--stem" aria-hidden />
                  <OrgTreeTopDown node={c} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgStructureChart({ title, raw }: { title: string; raw: string }) {
  const nodes = parseOrgText(raw || "");
  const tree = buildOrgTree(nodes);
  if (!tree.length) {
    return (
      <div className="org-chart org-chart-empty">
        <h4>{title}</h4>
        <p className="text-muted">
          Format: <code>Peran — Nama</code> atau <code>kode- Nama</code>. Indent spasi = level
          bawah (top-down).
        </p>
      </div>
    );
  }
  return (
    <div className="org-chart org-chart-topdown">
      <div className="org-chart-head">
        <h4>{title}</h4>
        <span className="org-chart-meta">{nodes.length} orang</span>
      </div>
      <div className="org-chart-scroll org-chart-scroll--topdown">
        <div className="org-td-forest">
          {tree.map((n, i) => (
            <OrgTreeTopDown key={`${n.role}-${i}`} node={n} />
          ))}
        </div>
      </div>
    </div>
  );
}

type PreKickoffPack = {
  background: string;
  scope: string;
  non_scope: string;
  timeline_summary: string;
  org_vendor: string;
  org_client: string;
  next_activities: string;
  deliverables_items: { id?: string; text: string }[];
  draft_timeline: DraftTimelineRow[];
  draft_timeline_ready: boolean;
  estimated_start_date: string | null;
  timeline_confirmed: boolean;
  is_complete: boolean;
};

function PreKickoffTab({
  projectId,
  readOnly,
  onTimelineChanged,
  onProjectRefresh,
}: {
  projectId: number;
  readOnly?: boolean;
  onTimelineChanged?: () => void;
  onProjectRefresh?: () => void;
}) {
  const [pack, setPack] = useState<PreKickoffPack | null>(null);
  const [msg, setMsg] = useState("");
  const [deckModal, setDeckModal] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [draftTimeline, setDraftTimeline] = useState<DraftTimelineRow[]>([]);
  const [estimatedStart, setEstimatedStart] = useState("");
  const textFields = ["background", "timeline_summary", "next_activities"] as const;
  const load = () =>
    api<PreKickoffPack>(`/projects/${projectId}/pre-kickoff`).then((p) => {
      setPack({
        ...p,
        deliverables_items: p.deliverables_items?.length
          ? p.deliverables_items.map((d) => ({
              id: d.id || newId(),
              text: d.text,
            }))
          : [],
      });
      setDraftTimeline(
        draftRowsWithParentRefs(
          (p.draft_timeline ?? []).map((r, idx) => ({
            id: r.id,
            row_key: r.row_key,
            name: r.name,
            duration_days: r.duration_days ?? 1,
            weight_pct: r.weight_pct ?? 0,
            start_date: r.start_date,
            target_date: r.target_date,
            item_type: r.item_type ?? "phase",
            parent_id: r.parent_id,
            parent_ref: r.parent_ref,
            sort_order: r.sort_order ?? idx,
            notes: r.notes ?? "",
          })),
        ),
      );
      setEstimatedStart(
        p.estimated_start_date ? toDateInputValue(p.estimated_start_date) : "",
      );
    });
  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
  }, [projectId]);
  const save = async () => {
    if (!pack) return;
    await api(`/projects/${projectId}/pre-kickoff`, {
      method: "PUT",
      body: JSON.stringify({
        background: pack.background,
        scope: pack.scope,
        non_scope: pack.non_scope,
        timeline_summary: pack.timeline_summary,
        org_vendor: pack.org_vendor,
        org_client: pack.org_client,
        next_activities: pack.next_activities,
        deliverables_items: pack.deliverables_items
          .filter((d) => d.text.trim())
          .map(({ id, text }) => ({ id, text: text.trim() })),
      }),
    });
    setMsg("Kick Off disimpan.");
    load();
    onProjectRefresh?.();
  };
  const canEditDraft =
    !readOnly &&
    !!pack?.draft_timeline_ready &&
    !pack.timeline_confirmed &&
    draftTimeline.length > 0;

  const saveKickoffDraftTimeline = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      const rowsPayload = draftRowsWithParentRefs(draftTimeline);
      const res = await api<{ draft_timeline: DraftTimelineRow[] }>(
        `/projects/${projectId}/sph/draft-timeline`,
        {
          method: "PUT",
          body: JSON.stringify({
            start_date: estimatedStart || null,
            rows: rowsPayload.map((r, idx) => ({
              id: r.id,
              row_key: r.row_key || String(r.id || idx),
              name: r.name,
              duration_days: r.item_type === "milestone" ? 0 : r.duration_days,
              weight_pct: r.item_type === "milestone" ? 0 : r.weight_pct,
              item_type: r.item_type,
              parent_ref: r.parent_ref || null,
              parent_id: r.parent_id ?? null,
              target_date: r.item_type === "milestone" ? r.target_date : undefined,
              sort_order: idx,
              notes: (r.notes ?? "").trim() || null,
            })),
          }),
        },
      );
      setDraftTimeline(draftRowsWithParentRefs(res.draft_timeline));
      setMsg("Draft timeline disimpan — tanggal dihitung ulang.");
      onTimelineChanged?.();
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  const persistKickoffStart = async () => {
    if (!canEditDraft) return;
    await api(`/projects/${projectId}/sph`, {
      method: "PUT",
      body: JSON.stringify({ estimated_start_date: estimatedStart || null }),
    });
  };

  const confirmTimeline = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      await api(`/projects/${projectId}/pre-kickoff/confirm-timeline`, { method: "POST" });
      setMsg("Timeline dikonfirmasi — lanjut ke delivery via «Lanjut fase» di panel kesehatan.");
      onTimelineChanged?.();
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const openKickoffGenerate = async () => {
    setMsg("");
    setDeckBusy(true);
    try {
      await previewFile(`/projects/${projectId}/pre-kickoff/preview-kickoff-deck`);
      setDeckModal(true);
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setDeckBusy(false);
    }
  };
  const confirmDeckSave = async () => {
    setDeckBusy(true);
    setMsg("");
    try {
      await api(`/projects/${projectId}/pre-kickoff/generate-kickoff-deck`, { method: "POST" });
      setMsg("Deck kick off disimpan ke tab Documents.");
      setDeckModal(false);
      load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setDeckBusy(false);
    }
  };
  if (!pack) return <div className="card">Memuat Kick Off…</div>;

  return (
    <div className="kickoff-layout">
      <header className="kickoff-hero card">
        <div>
          <h2 className="card-title">Kick Off meeting pack</h2>
          <p className="text-muted">
            Scope dan deliverables dari SPH; timeline draft direview sebelum konfirmasi resmi.
          </p>
        </div>
        <div className="kickoff-status-pills">
          <span className={`pill ${pack.timeline_confirmed ? "pill-ok" : "pill-warn"}`}>
            Timeline {pack.timeline_confirmed ? "confirmed" : "draft review"}
          </span>
          <span className={`pill ${pack.is_complete ? "pill-ok" : "pill-neutral"}`}>
            Pack {pack.is_complete ? "lengkap" : "draft"}
          </span>
        </div>
      </header>
      {readOnly && <TabReadOnlyNotice message={TAB_READONLY_MSG.kickoff} />}
      <TabAlert message={msg} />
      <fieldset disabled={readOnly} className="kickoff-fieldset">
      <div className="kickoff-grid">
        <section className="card kickoff-section">
          <h3 className="card-title">Scope & non-scope</h3>
          <div className="form-row">
            <label>Scope (SPH SOW)</label>
            <textarea rows={4} readOnly value={pack.scope ?? ""} className="readonly-block" />
          </div>
          <div className="form-row">
            <label>Non scope</label>
            <textarea rows={3} readOnly value={pack.non_scope ?? ""} className="readonly-block" />
          </div>
        </section>
        <section className="card kickoff-section">
          <h3 className="card-title">Ringkasan</h3>
          {textFields.map((f) => (
            <div className="form-row" key={f}>
              <label>{f.replace(/_/g, " ")}</label>
              <textarea
                rows={2}
                value={pack[f] ?? ""}
                onChange={(e) => setPack({ ...pack, [f]: e.target.value })}
              />
            </div>
          ))}
        </section>
      </div>
      <div className="kickoff-org-grid">
        <section className="card kickoff-section">
          <h3 className="card-title">Organisasi Vendor</h3>
          <textarea
            rows={6}
            className="org-editor"
            value={pack.org_vendor ?? ""}
            placeholder={"PM — Nama\n  Tech Lead — Nama\n  Engineer — Nama"}
            onChange={(e) => setPack({ ...pack, org_vendor: e.target.value })}
          />
          <OrgStructureChart title="Struktur organisasi (top-down)" raw={pack.org_vendor ?? ""} />
        </section>
        <section className="card kickoff-section">
          <h3 className="card-title">Organisasi Klien</h3>
          <textarea
            rows={6}
            className="org-editor"
            value={pack.org_client ?? ""}
            placeholder={"Project Owner — Nama\n  Business SME — Nama"}
            onChange={(e) => setPack({ ...pack, org_client: e.target.value })}
          />
          <OrgStructureChart title="Struktur organisasi (top-down)" raw={pack.org_client ?? ""} />
        </section>
      </div>
      <section className="card kickoff-section">
      <h3 className="card-title">Deliverables</h3>
      <SphLineList
        items={pack.deliverables_items.map((d) => ({ id: d.id!, text: d.text }))}
        setItems={(items) =>
          setPack({
            ...pack,
            deliverables_items: items.map((i) => ({ id: i.id, text: i.text })),
          })
        }
        placeholder="Deliverable..."
      />
      </section>
      <section className="card kickoff-section ui-section">
        <h3 className="card-title">Draft timeline Kick Off</h3>
        <p className="text-muted ui-section__desc">
          Muncul setelah SPH selesai («Lanjut ke Kick Off»). Urutkan baris, isi catatan, sesuaikan
          bobot (total root 100%, anak = parent), durasi, dan tanggal — sama seperti tab SPH — lalu
          konfirmasi sebelum fase delivery.
        </p>
        {!pack.draft_timeline_ready ? (
          <p className="text-muted">
            Belum tersedia — lengkapi SPH + draft + termin, lalu tombol{" "}
            <strong>Lanjut ke fase berikutnya «Kick Off»</strong> di tab SPH.
          </p>
        ) : (
          <>
            <div className="form-row" style={{ maxWidth: "20rem" }}>
              <label htmlFor="ko-start">Estimasi mulai proyek</label>
              <input
                id="ko-start"
                type="date"
                disabled={!canEditDraft}
                value={estimatedStart}
                onChange={(e) => setEstimatedStart(e.target.value)}
                onBlur={() => {
                  persistKickoffStart()
                    .then(() => (draftTimeline.length > 0 ? saveKickoffDraftTimeline() : undefined))
                    .catch((e) => setMsg(getErrorMessage(e)));
                }}
              />
            </div>
            <DraftTimelineTable
              canEdit={canEditDraft}
              draftTimeline={draftTimeline}
              setDraftTimeline={setDraftTimeline}
              onSave={saveKickoffDraftTimeline}
            />
            {!pack.timeline_confirmed && draftTimeline.length > 0 && (
              <div className="ui-toolbar">
                <button type="button" className="primary" onClick={confirmTimeline}>
                  Konfirmasi timeline (Kick Off OK)
                </button>
              </div>
            )}
            {pack.timeline_confirmed && (
              <p className="text-muted">
                Timeline sudah dikonfirmasi — gunakan «Lanjut fase → Project Start» di panel
                kesehatan proyek jika pack lengkap.
              </p>
            )}
          </>
        )}
      </section>
      <div className="kickoff-actions card">
      <div className="btn-group">
        <button type="button" className="primary" onClick={save}>
          Simpan pack
        </button>
        <button type="button" disabled={deckBusy} onClick={openKickoffGenerate}>
          Generate kickoff deck
        </button>
      </div>
      </div>
      </fieldset>
      <TabDocumentUpload
        projectId={projectId}
        docType="mom"
        phase="pre_kickoff"
        title="Dokumen Kick Off"
        hint="MoM, materi presentasi, atau lampiran kick off meeting."
        readOnly={readOnly}
      />
      {deckModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2 className="card-title">Generate kickoff deck</h2>
            <p className="text-muted">
              File dibuka / diunduh untuk dicek. Jika OK, simpan ke tab <strong>DOCUMENTS</strong>.
            </p>
            <div className="btn-group">
              <button
                type="button"
                className="primary"
                disabled={deckBusy}
                onClick={confirmDeckSave}
              >
                OK — Simpan ke Documents
              </button>
              <button type="button" disabled={deckBusy} onClick={() => setDeckModal(false)}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WEEKDAY_OPTS = [
  { v: 0, label: "Senin" },
  { v: 1, label: "Selasa" },
  { v: 2, label: "Rabu" },
  { v: 3, label: "Kamis" },
  { v: 4, label: "Jumat" },
  { v: 5, label: "Sabtu" },
  { v: 6, label: "Minggu" },
];

function ClickUpTab({ projectId }: { projectId: number }) {
  const [recap, setRecap] = useState<{
    total: number;
    closed: number;
    open: number;
    overdue: number;
    tasks: TaskRecapRow[];
    groups?: TaskRecapGroup[];
  } | null>(null);
  const [cfg, setCfg] = useState({
    clickup_enabled: false,
    clickup_folder_id: "",
    clickup_list_id: "",
    clickup_space_id: "",
    configured: false,
    clickup_provision_status: "not_requested",
    kickoff_timeline_confirmed: false,
    sync_mode: "none" as "none" | "folder" | "legacy_list",
  });
  const [folderLists, setFolderLists] = useState<{ id: string; name: string }[]>([]);
  const [milestoneMap, setMilestoneMap] = useState<
    { milestone_id: number; name: string; clickup_list_id: string | null }[]
  >([]);
  const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfgMsgOk, setCfgMsgOk] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const load = () => api<typeof recap>(`/projects/${projectId}/tasks/recap`).then(setRecap);
  useEffect(() => {
    load().catch(() => {});
    api<{
      clickup_enabled: boolean;
      clickup_folder_id: string | null;
      clickup_list_id: string | null;
      clickup_space_id: string | null;
      configured: boolean;
      clickup_provision_status?: string;
      kickoff_timeline_confirmed?: boolean;
      sync_mode?: "none" | "folder" | "legacy_list";
    }>(`/integrations/clickup/by-project/${projectId}`)
      .then((c) => {
        setCfg({
          clickup_enabled: c.clickup_enabled,
          clickup_folder_id: c.clickup_folder_id ?? "",
          clickup_list_id: c.clickup_list_id ?? "",
          clickup_space_id: c.clickup_space_id ?? "",
          configured: c.configured,
          clickup_provision_status: c.clickup_provision_status ?? "not_requested",
          kickoff_timeline_confirmed: !!c.kickoff_timeline_confirmed,
          sync_mode: c.sync_mode ?? (c.clickup_folder_id ? "folder" : c.clickup_list_id ? "legacy_list" : "none"),
        });
      })
      .catch(() => {});
    api<{
      milestones: {
        milestone_id: number;
        name: string;
        clickup_list_id: string | null;
      }[];
    }>(`/integrations/clickup/by-project/${projectId}/milestone-list-map`)
      .then((r) => {
        setMilestoneMap(r.milestones);
        const mapped = r.milestones.some((m) => m.clickup_list_id);
        if (mapped) setLinkMode("existing");
      })
      .catch(() => {});
  }, [projectId]);

  const notify = (msg: string, ok = true) => {
    setCfgMsg(msg);
    setCfgMsgOk(ok);
  };

  const loadFolderLists = async () => {
    notify("");
    const fid = cfg.clickup_folder_id.trim();
    if (!fid) {
      notify("Isi Folder ID lalu Simpan, atau gunakan mode Struktur baru.", false);
      return;
    }
    try {
      const q = fid ? `?folder_id=${encodeURIComponent(fid)}` : "";
      const r = await api<{ lists: { id: string; name: string }[] }>(
        `/integrations/clickup/by-project/${projectId}/folder-lists${q}`,
      );
      setFolderLists(r.lists);
      notify(`Dimuat ${r.lists.length} list dari folder ClickUp.`);
    } catch (e) {
      notify(getErrorMessage(e), false);
    }
  };

  const saveMilestoneMap = async () => {
    notify("");
    try {
      await api(`/integrations/clickup/by-project/${projectId}/milestone-list-map`, {
        method: "PUT",
        body: JSON.stringify({
          mappings: milestoneMap.map((m) => ({
            milestone_id: m.milestone_id,
            clickup_list_id: m.clickup_list_id,
          })),
        }),
      });
      notify("Mapping phase ↔ list disimpan.");
    } catch (e) {
      notify(getErrorMessage(e), false);
    }
  };

  const saveClickUpCfg = async (opts?: { enable?: boolean; folderId?: string }) => {
    const folderId = (opts?.folderId ?? cfg.clickup_folder_id).trim();
    if (
      (opts?.enable ?? cfg.clickup_enabled) &&
      !folderId &&
      !cfg.clickup_list_id.trim() &&
      linkMode === "existing"
    ) {
      notify("Isi Folder ID folder existing lalu Simpan.", false);
      return false;
    }
    try {
      await api(`/integrations/clickup/by-project/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          clickup_enabled: opts?.enable ?? cfg.clickup_enabled,
          clickup_list_id: cfg.clickup_list_id.trim() || null,
          clickup_folder_id: folderId || null,
        }),
      });
      if (folderId && folderId !== cfg.clickup_folder_id) {
        setCfg((c) => ({ ...c, clickup_folder_id: folderId }));
      }
      if (opts?.enable) {
        setCfg((c) => ({ ...c, clickup_enabled: true }));
      }
      return true;
    } catch (e) {
      notify(getErrorMessage(e), false);
      return false;
    }
  };

  const sync = async () => {
    notify("");
    setSyncBusy(true);
    try {
      const r = await syncClickUpProgress(projectId);
      notify(formatClickUpSyncMessage(r));
      load();
    } catch (e) {
      notify(getErrorMessage(e), false);
    } finally {
      setSyncBusy(false);
    }
  };

  const ensureFolder = async (): Promise<string | null> => {
    notify("");
    try {
      const r = await api<{ clickup_folder_id: string; clickup_space_id: string }>(
        `/integrations/clickup/by-project/${projectId}/ensure-folder`,
        { method: "POST" },
      );
      setCfg((c) => ({
        ...c,
        clickup_folder_id: r.clickup_folder_id,
        clickup_space_id: r.clickup_space_id,
        clickup_enabled: true,
        sync_mode: "folder",
      }));
      setLinkMode("new");
      return r.clickup_folder_id;
    } catch (e) {
      notify(getErrorMessage(e), false);
      return null;
    }
  };

  const provisionClickUp = async (autoCreateLists: boolean, folderIdOverride?: string) => {
    notify("");
    if (!cfg.kickoff_timeline_confirmed) {
      notify("Konfirmasi timeline di tab Kick Off terlebih dahulu.", false);
      return;
    }
    try {
      const ok = await saveClickUpCfg({ enable: true, folderId: folderIdOverride });
      if (!ok) return;
      const q = autoCreateLists ? "?auto_create_lists=true" : "?auto_create_lists=false";
      const r = await api<{
        created_lists?: number;
        created_tasks?: number;
        created_subtasks?: number;
        skipped_milestones_no_list?: number;
        skipped?: boolean;
      }>(`/integrations/clickup/by-project/${projectId}/provision-timeline${q}`, {
        method: "POST",
      });
      const skipMs = r.skipped_milestones_no_list ?? 0;
      notify(
        r.skipped
          ? "Struktur ClickUp sudah pernah digenerate."
          : autoCreateLists
            ? `List dari timeline: ${r.created_lists ?? 0} · task milestone: ${r.created_tasks ?? 0} · subtask: ${r.created_subtasks ?? 0}.`
            : `Task milestone: ${r.created_tasks ?? 0} · subtask: ${r.created_subtasks ?? 0}${
                skipMs ? ` · ${skipMs} milestone belum punya list` : ""
              }.`,
      );
      const refreshed = await api<{
        clickup_folder_id: string | null;
        clickup_provision_status?: string;
        sync_mode?: "none" | "folder" | "legacy_list";
      }>(`/integrations/clickup/by-project/${projectId}`);
      setCfg((c) => ({
        ...c,
        clickup_folder_id: refreshed.clickup_folder_id ?? c.clickup_folder_id,
        clickup_provision_status: refreshed.clickup_provision_status ?? "provisioned",
        sync_mode: refreshed.sync_mode ?? "folder",
        clickup_enabled: true,
      }));
      const mapRefresh = await api<{
        milestones: { milestone_id: number; name: string; clickup_list_id: string | null }[];
      }>(`/integrations/clickup/by-project/${projectId}/milestone-list-map`);
      setMilestoneMap(mapRefresh.milestones);
      load();
    } catch (e) {
      notify(getErrorMessage(e), false);
    }
  };

  const createFolderAndGenerateFromTimeline = async () => {
    notify("");
    if (!cfg.kickoff_timeline_confirmed) {
      notify("Konfirmasi timeline di tab Kick Off terlebih dahulu.", false);
      return;
    }
    let folderId = cfg.clickup_folder_id.trim();
    if (!folderId) {
      const created = await ensureFolder();
      if (!created) return;
      folderId = created;
    } else {
      const ok = await saveClickUpCfg({ enable: true, folderId: folderId });
      if (!ok) return;
    }
    await provisionClickUp(true, folderId);
  };

  const mappedCount = milestoneMap.filter((m) => m.clickup_list_id).length;
  const provisionLabel =
    cfg.clickup_provision_status === "provisioned" ? "Provisioned" : cfg.clickup_provision_status;
  return (
    <div className="setup-project-page">
      <header className="card setup-project-header">
        <h2 className="card-title">ClickUp & setup delivery</h2>
        <p className="text-muted">
          Bispro: setelah <strong>Kick off OK</strong> → <strong>Project Start</strong> membuat
          timeline operasional + struktur ClickUp (folder/list/task). Sync memperbarui progress task.
        </p>
      </header>
      <TabAlert message={cfgMsg} variant={cfgMsg ? (cfgMsgOk ? "success" : "error") : undefined} />
      <div className="setup-project-grid">
        <section className="card setup-section setup-clickup-panel">
          <div className="setup-clickup-toolbar">
            <div>
              <h3 className="card-title" style={{ marginBottom: "0.25rem" }}>
                ClickUp
              </h3>
              <p className="text-muted form-hint" style={{ margin: 0 }}>
                Folder = proyek · List = phase · Task + subtask ClickUp.
              </p>
            </div>
            <div className="setup-clickup-mode" role="tablist" aria-label="Mode folder ClickUp">
              <button
                type="button"
                className={linkMode === "new" ? "is-active" : ""}
                onClick={() => setLinkMode("new")}
              >
                Struktur baru
              </button>
              <button
                type="button"
                className={linkMode === "existing" ? "is-active" : ""}
                onClick={() => setLinkMode("existing")}
              >
                Folder existing
              </button>
            </div>
          </div>
          {!cfg.configured && (
            <p className="error setup-alert">
              Integrasi org belum lengkap.{" "}
              <Link to="/config/clickup">Setting → Integrasi ClickUp</Link>
            </p>
          )}
          <div className="setup-clickup-meta">
            <span
              className={`badge ${cfg.clickup_enabled ? "badge-success" : "badge-warning"}`}
            >
              {cfg.clickup_enabled ? "ClickUp aktif" : "ClickUp nonaktif"}
            </span>
            <span className="badge badge-info">{provisionLabel}</span>
            {cfg.clickup_folder_id && (
              <span className="badge badge-indigo">Folder · {cfg.clickup_folder_id.slice(0, 8)}…</span>
            )}
            {!cfg.kickoff_timeline_confirmed && (
              <span className="badge badge-warning">Timeline Kick Off belum OK</span>
            )}
            {linkMode === "existing" && milestoneMap.length > 0 && (
              <span className="badge badge-info">
                Mapping {mappedCount}/{milestoneMap.length}
              </span>
            )}
          </div>
          <label className="setup-check">
            <input
              type="checkbox"
              checked={cfg.clickup_enabled}
              disabled={!cfg.configured}
              onChange={(e) => setCfg({ ...cfg, clickup_enabled: e.target.checked })}
            />{" "}
            Aktifkan ClickUp di proyek ini
          </label>
          <div className="setup-clickup-body">
            {linkMode === "new" ? (
              <div className="setup-clickup-steps">
                <div className="setup-clickup-step">
                  <h4>1 · Folder proyek</h4>
                  <p className="form-hint text-muted">
                    Buat folder baru di ClickUp untuk proyek ini (atau lanjut jika ID folder sudah
                    terisi dari langkah sebelumnya).
                  </p>
                  <div className="form-row">
                    <label>Folder ID</label>
                    <input
                      value={cfg.clickup_folder_id}
                      placeholder="Terisi otomatis setelah buat folder"
                      onChange={(e) =>
                        setCfg({ ...cfg, clickup_folder_id: e.target.value, sync_mode: "folder" })
                      }
                    />
                  </div>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      disabled={!cfg.configured}
                      onClick={() => void ensureFolder()}
                    >
                      Buat folder proyek
                    </button>
                  </div>
                </div>
                <div className="setup-clickup-step">
                  <h4>2 · List & task dari timeline</h4>
                  <p className="form-hint text-muted">
                    Satu <strong>list ClickUp per milestone</strong> kick off (nama mengikuti
                    timeline), lalu task container, subtask, dan checklist template.
                  </p>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={!cfg.configured || !cfg.kickoff_timeline_confirmed}
                      onClick={() => void createFolderAndGenerateFromTimeline()}
                    >
                      Buat folder &amp; generate dari timeline
                    </button>
                    <button
                      type="button"
                      disabled={!cfg.configured || !cfg.kickoff_timeline_confirmed}
                      onClick={() => void provisionClickUp(true)}
                    >
                      Generate ulang list/task
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="setup-clickup-steps">
                <div className="setup-clickup-step">
                  <h4>1 · Hubungkan folder</h4>
                  <div className="form-row">
                    <label>Folder ID (existing)</label>
                    <input
                      value={cfg.clickup_folder_id}
                      placeholder="Tempel ID folder dari ClickUp"
                      onChange={(e) =>
                        setCfg({ ...cfg, clickup_folder_id: e.target.value, sync_mode: "folder" })
                      }
                    />
                  </div>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={!cfg.configured}
                      onClick={() => void saveClickUpCfg().then((ok) => ok && notify("Folder disimpan."))}
                    >
                      Simpan folder
                    </button>
                    <button
                      type="button"
                      disabled={!cfg.configured || !cfg.clickup_folder_id.trim()}
                      onClick={() => void loadFolderLists()}
                    >
                      Muat list
                    </button>
                  </div>
                </div>
                <div className="setup-clickup-step">
                  <h4>2 · Generate task di list terpilih</h4>
                  <p className="form-hint text-muted">
                    Mapping milestone ke list di panel kanan, simpan, lalu generate task (tanpa
                    membuat list baru).
                  </p>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={
                        !cfg.configured ||
                        !cfg.kickoff_timeline_confirmed ||
                        mappedCount === 0
                      }
                      onClick={() => void provisionClickUp(false)}
                    >
                      Generate task dari mapping
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="setup-clickup-step setup-clickup-map">
              <h4>{linkMode === "existing" ? "Mapping phase ↔ list" : "Phase timeline"}</h4>
              {milestoneMap.length === 0 ? (
                <p className="setup-clickup-map-empty">
                  Belum ada milestone kick off. Konfirmasi timeline di tab Kick Off.
                </p>
              ) : linkMode === "existing" ? (
                <>
                  {folderLists.length === 0 && (
                    <p className="setup-clickup-map-empty">Muat list dari folder untuk dropdown.</p>
                  )}
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Phase</th>
                        <th>List ClickUp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestoneMap.map((row) => (
                        <tr key={row.milestone_id}>
                          <td>{row.name}</td>
                          <td>
                            <select
                              value={row.clickup_list_id ?? ""}
                              onChange={(e) =>
                                setMilestoneMap((prev) =>
                                  prev.map((m) =>
                                    m.milestone_id === row.milestone_id
                                      ? {
                                          ...m,
                                          clickup_list_id: e.target.value || null,
                                        }
                                      : m,
                                  ),
                                )
                              }
                            >
                              <option value="">— pilih list —</option>
                              {folderLists.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                              {row.clickup_list_id &&
                                !folderLists.some((l) => l.id === row.clickup_list_id) && (
                                  <option value={row.clickup_list_id}>
                                    List {row.clickup_list_id}
                                  </option>
                                )}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="setup-clickup-actions">
                    <button type="button" className="primary" onClick={() => void saveMilestoneMap()}>
                      Simpan mapping
                    </button>
                  </div>
                </>
              ) : (
                <ul className="setup-clickup-map-empty" style={{ paddingLeft: "1.1rem", margin: 0 }}>
                  {milestoneMap.map((m) => (
                    <li key={m.milestone_id}>
                      {m.name}
                      {m.clickup_list_id ? " · list OK" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <details className="setup-clickup-legacy">
            <summary className="text-muted">Lanjutan · satu list (legacy)</summary>
            <div className="form-row">
              <label>List ID</label>
              <input
                value={cfg.clickup_list_id}
                placeholder="Hanya jika tidak pakai folder"
                onChange={(e) => setCfg({ ...cfg, clickup_list_id: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => void saveClickUpCfg().then((ok) => ok && notify("List legacy disimpan."))}
            >
              Simpan list legacy
            </button>
          </details>
          <div className="setup-clickup-actions" style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border-light)" }}>
            <button
              type="button"
              disabled={
                syncBusy ||
                !cfg.clickup_enabled ||
                (!cfg.clickup_folder_id.trim() && !cfg.clickup_list_id.trim())
              }
              onClick={() => void sync()}
            >
              {syncBusy ? "Sync…" : "Sync progress dari ClickUp"}
            </button>
          </div>
          {syncBusy && (
            <div className="sync-progress-bar" role="progressbar" aria-busy="true" aria-label="Sinkronisasi ClickUp">
              <div className="sync-progress-bar__indeterminate" />
            </div>
          )}
        </section>
      </div>
      {recap && (
        <section className="card setup-section setup-tasks-recap">
          <h3 className="card-title">Ringkasan task</h3>
          <p>
            Total <strong>{recap.total}</strong> · Open {recap.open} · Closed {recap.closed} ·
            Overdue {recap.overdue}
          </p>
          {(recap.tasks?.length ?? 0) > 0 && (
            <TaskRecapTables
              groups={recap.groups?.map((g) => ({
                ...g,
                tasks: g.tasks.slice(0, 15),
              }))}
              tasks={recap.tasks.slice(0, 30)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function ProjectRagConfig({ projectId }: { projectId: number }) {
  const { can } = useAuth();
  const canEdit = can("health.config.write");
  const [cfg, setCfg] = useState({
    spi_green_min: "1",
    spi_yellow_min: "0.9",
    progress_gap_green_max: "5",
    progress_gap_yellow_max: "15",
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{
      spi_green_min: number;
      spi_yellow_min: number;
      progress_gap_green_max: number;
      progress_gap_yellow_max: number;
    }>(`/projects/${projectId}/health/config`)
      .then((c) =>
        setCfg({
          spi_green_min: String(c.spi_green_min),
          spi_yellow_min: String(c.spi_yellow_min),
          progress_gap_green_max: String(c.progress_gap_green_max),
          progress_gap_yellow_max: String(c.progress_gap_yellow_max),
        }),
      )
      .catch(() => {});
  }, [projectId]);
  const msgOk = msg === "Ambang RAG & SPI disimpan.";
  const save = async () => {
    if (!canEdit) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/health/config`, {
        method: "PATCH",
        body: JSON.stringify({
          spi_green_min: Number(cfg.spi_green_min),
          spi_yellow_min: Number(cfg.spi_yellow_min),
          progress_gap_green_max: Number(cfg.progress_gap_green_max),
          progress_gap_yellow_max: Number(cfg.progress_gap_yellow_max),
        }),
      });
      setMsg("Ambang RAG & SPI disimpan.");
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <section className="reports-rag-section" aria-labelledby="reports-rag-heading">
      <h2 id="reports-rag-heading" className="subsection-title">
        Ambang RAG & SPI
      </h2>
      <p className="text-muted form-hint reports-rag-section__lead">
        Ambang hijau / kuning untuk status RAG di panel kesehatan proyek, tabel S-curve di bawah, dan
        weekly report. SPI = progress actual ÷ target (planned) pada periode snapshot.
      </p>
      <TabAlert message={msg} variant={msg ? (msgOk ? "success" : "error") : undefined} />
      {!canEdit && (
        <TabAlert
          message="Tampilan ambang saat ini (read-only). Ubah nilai membutuhkan izin health.config.write."
          variant="info"
        />
      )}
      <div className="reports-rag-layout">
        <div className="reports-rag-panel sph-info-panel">
          <h3 className="sph-info-panel__title">SPI (Schedule Performance Index)</h3>
          <p className="form-hint reports-rag-panel__hint">
            Semakin tinggi SPI, semakin dekat actual dengan rencana.
          </p>
          <div className="sph-info-grid">
            <div className="form-row">
              <label htmlFor="rag-spi-green">Minimum SPI — Green</label>
              <input
                id="rag-spi-green"
                type="number"
                step="0.01"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.spi_green_min}
                onChange={(e) => setCfg({ ...cfg, spi_green_min: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="rag-spi-yellow">Minimum SPI — Yellow</label>
              <input
                id="rag-spi-yellow"
                type="number"
                step="0.01"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.spi_yellow_min}
                onChange={(e) => setCfg({ ...cfg, spi_yellow_min: e.target.value })}
              />
            </div>
          </div>
          <ul className="plain reports-rag-rules">
            <li>
              <span className="rag rag-green">Green</span> jika SPI ≥ minimum Green
            </li>
            <li>
              <span className="rag rag-yellow">Yellow</span> jika SPI ≥ minimum Yellow (dan &lt; Green)
            </li>
            <li>
              <span className="rag rag-red">Red</span> jika SPI &lt; minimum Yellow
            </li>
          </ul>
        </div>
        <div className="reports-rag-panel sph-info-panel">
          <h3 className="sph-info-panel__title">Deviasi progress (%)</h3>
          <p className="form-hint reports-rag-panel__hint">
            Selisih actual − target; dipakai sebagai penunjang RAG bila SPI tidak tersedia.
          </p>
          <div className="sph-info-grid">
            <div className="form-row">
              <label htmlFor="rag-gap-green">Maks. deviasi — Green (%)</label>
              <input
                id="rag-gap-green"
                type="number"
                step="0.1"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.progress_gap_green_max}
                onChange={(e) => setCfg({ ...cfg, progress_gap_green_max: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="rag-gap-yellow">Maks. deviasi — Yellow (%)</label>
              <input
                id="rag-gap-yellow"
                type="number"
                step="0.1"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.progress_gap_yellow_max}
                onChange={(e) => setCfg({ ...cfg, progress_gap_yellow_max: e.target.value })}
              />
            </div>
          </div>
          <ul className="plain reports-rag-rules">
            <li>
              <span className="rag rag-green">Green</span> jika |deviasi| ≤ ambang Green
            </li>
            <li>
              <span className="rag rag-yellow">Yellow</span> jika |deviasi| ≤ ambang Yellow
            </li>
            <li>
              <span className="rag rag-red">Red</span> di luar ambang Yellow
            </li>
          </ul>
        </div>
      </div>
      {canEdit && (
        <div className="ui-toolbar reports-rag-actions">
          <button type="button" className="primary" onClick={() => void save()}>
            Simpan ambang RAG & SPI
          </button>
        </div>
      )}
    </section>
  );
}

type ScurvePointRow = {
  date: string;
  planned_pct: number;
  actual_pct: number;
  spi: number;
  cut_off_date?: string;
};

function scurveActualVisible(
  point: ScurvePointRow,
  activeAnchor: string | null,
): boolean {
  if (!activeAnchor) return true;
  return point.date <= activeAnchor;
}

function straightLinePath(xs: number[], ys: number[]): string {
  if (!xs.length) return "";
  if (xs.length === 1) return `M ${xs[0]} ${ys[0]}`;
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i += 1) {
    d += ` L ${xs[i]} ${ys[i]}`;
  }
  return d;
}

const CHART_COLOR_PLANNED = "#2563eb";
const CHART_COLOR_ACTUAL = "#b45309";

function ChartInlineLegend({
  x,
  y,
  items,
}: {
  x: number;
  y: number;
  items: { label: string; color: string }[];
}) {
  const rowH = 17;
  const pad = 8;
  const boxW = 148;
  const boxH = pad * 2 + items.length * rowH - 4;
  return (
    <g className="chart-inline-legend" transform={`translate(${x}, ${y})`}>
      <rect
        x={0}
        y={0}
        width={boxW}
        height={boxH}
        rx={6}
        className="chart-inline-legend__bg"
      />
      {items.map((it, i) => (
        <g key={it.label} transform={`translate(${pad}, ${pad + i * rowH})`}>
          <line
            x1={0}
            y1={5}
            x2={20}
            y2={5}
            stroke={it.color}
            strokeWidth={2.75}
            strokeLinecap="round"
          />
          <text x={26} y={9} className="chart-inline-legend__label">
            {it.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function ScurveChart({
  points,
  activeAnchor,
  statusDateReport,
  projectCode,
  projectName,
}: {
  points: ScurvePointRow[];
  activeAnchor?: string | null;
  statusDateReport?: string | null;
  projectCode?: string;
  projectName?: string;
}) {
  const svgRef = useChartSvgRef();
  const { zoom, zoomIn, zoomOut, resetZoom } = useChartZoom();
  const { tip, showTip, moveTip, hideTip } = useChartTooltip();
  const plannedAll = points;
  if (!plannedAll.length) {
    return <p className="text-muted">Belum ada data S-curve.</p>;
  }
  const w = 960;
  const padL = 58;
  const padR = 32;
  const padT = 88;
  const padB = 108;
  const chartW = w - padL - padR;
  const chartH = 248;
  const h = padT + chartH + padB;
  const xLabelY = padT + chartH + 34;
  const yMax = 100;
  const n = plannedAll.length;
  const xs = plannedAll.map(
    (_, i) => padL + (i * chartW) / Math.max(n - 1, 1),
  );
  const y = (pct: number) => padT + chartH - (Math.min(pct, yMax) / yMax) * chartH;
  const plannedYs = plannedAll.map((p) => y(p.planned_pct));
  const plannedPath = straightLinePath(xs, plannedYs);
  const actualSeries = plannedAll.filter((p) => scurveActualVisible(p, activeAnchor ?? null));
  const actualXs = actualSeries.map((p) => xs[plannedAll.findIndex((x) => x.date === p.date)]);
  const actualYs = actualSeries.map((p) => y(p.actual_pct));
  const actualPath =
    actualSeries.length > 0 ? straightLinePath(actualXs, actualYs) : "";
  const gridSteps = [0, 25, 50, 75, 100];
  const fmtAnchor = (iso: string) => formatDisplayDate(iso);
  const labelEvery = n <= 12 ? 1 : Math.max(1, Math.ceil(n / 8));
  const activeIdx =
    activeAnchor != null ? plannedAll.findIndex((p) => p.date === activeAnchor) : -1;
  const activePoint =
    (activeAnchor != null && plannedAll.find((p) => p.date === activeAnchor)) ||
    actualSeries[actualSeries.length - 1] ||
    plannedAll[0];
  const kpiPlanned = activePoint?.planned_pct ?? 0;
  const kpiActual = activePoint?.actual_pct ?? 0;
  const kpiDev = kpiActual - kpiPlanned;
  const kpiSpi = activePoint?.spi ?? 0;
  const statusLabel = statusDateReport ? formatDisplayDate(statusDateReport) : "—";
  const anchorLabel = activeAnchor ? formatDisplayDate(activeAnchor) : "—";
  const projectTitle =
    projectCode && projectName
      ? `${projectCode} — ${projectName}`
      : projectName || projectCode || "Project S-Curve";
  const exportBasename = `${(projectCode || "project").replace(/\s+/g, "_")}_scurve`;
  return (
    <div className="scurve-panel scurve-panel--pro scurve-panel--executive">
      <div className="scurve-panel__top scurve-panel__top--executive">
        <div>
          <p className="scurve-panel__kicker">Executive progress report</p>
          <h3 className="scurve-panel__title">{projectTitle}</h3>
          <p className="scurve-panel__meta">
            <span className="scurve-meta-pill">
              Status date <strong>{statusLabel}</strong>
            </span>
            <span className="scurve-meta-pill">
              Tanggal laporan aktif <strong>{anchorLabel}</strong>
            </span>
          </p>
        </div>
      </div>
      <ChartPanelToolbar
        svgRef={svgRef}
        exportBasename={exportBasename}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={resetZoom}
      />
      <div className="scurve-kpi-strip" aria-label="KPI minggu aktif">
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">Planned</span>
          <span className="scurve-kpi-strip__value">{kpiPlanned.toFixed(2)}%</span>
        </div>
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">Actual</span>
          <span className="scurve-kpi-strip__value">{kpiActual.toFixed(2)}%</span>
        </div>
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">Deviasi</span>
          <span
            className={`scurve-kpi-strip__value ${kpiDev < 0 ? "scurve-kpi-strip__value--down" : ""}`}
          >
            {formatDeviationPct(kpiDev)}
          </span>
        </div>
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">SPI</span>
          <span className="scurve-kpi-strip__value">{Number(kpiSpi).toFixed(4)}</span>
        </div>
      </div>
      <ChartZoomViewport zoom={zoom}>
      <svg
        ref={svgRef}
        className="scurve-panel__chart scurve-panel__chart--executive"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Grafik garis S-curve planned dan actual"
        onMouseLeave={hideTip}
      >
        <defs>
          <linearGradient id="scurveExecFrame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <clipPath id="scurvePlotClip">
            <rect x={padL} y={padT} width={chartW} height={chartH} rx="6" />
          </clipPath>
        </defs>
        <rect x={8} y={8} width={w - 16} height={h - 16} rx="10" fill="url(#scurveExecFrame)" />
        <rect
          x={padL}
          y={padT}
          width={chartW}
          height={chartH}
          className="scurve-plot-bg"
          rx="6"
        />
        {gridSteps.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              y1={y(g)}
              x2={w - padR}
              y2={y(g)}
              className="scurve-grid-line"
            />
            <text x={padL - 10} y={y(g) + 4} textAnchor="end" className="scurve-axis-label">
              {g}
            </text>
          </g>
        ))}
        <text
          x={14}
          y={padT + chartH / 2}
          textAnchor="middle"
          className="scurve-axis-title"
          transform={`rotate(-90 14 ${padT + chartH / 2})`}
        >
          Progress (%)
        </text>
        <line x1={padL} y1={padT + chartH} x2={w - padR} y2={padT + chartH} className="scurve-axis" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} className="scurve-axis" />
        <ChartInlineLegend
          x={w - padR - 152}
          y={padT + 6}
          items={[
            { label: "Planned (target)", color: CHART_COLOR_PLANNED },
            { label: "Actual", color: CHART_COLOR_ACTUAL },
          ]}
        />
        <g clipPath="url(#scurvePlotClip)">
          {activeIdx >= 0 && (
            <line
              x1={xs[activeIdx]}
              y1={padT}
              x2={xs[activeIdx]}
              y2={padT + chartH}
              className="scurve-active-week-line"
            />
          )}
          <path d={plannedPath} className="scurve-line-planned" />
          {actualPath ? <path d={actualPath} className="scurve-line-actual" /> : null}
        </g>
        {plannedAll.map((p, i) => {
          const showActual = scurveActualVisible(p, activeAnchor ?? null);
          const dev = p.actual_pct - p.planned_pct;
          const tipRows = [
            {
              legend: "Planned (target)",
              value: `${p.planned_pct.toFixed(2)}%`,
              tone: "planned" as const,
            },
            ...(showActual
              ? [
                  {
                    legend: "Actual",
                    value: `${p.actual_pct.toFixed(2)}%`,
                    tone: "actual" as const,
                  },
                  {
                    legend: "Deviasi",
                    value: formatDeviationPct(dev),
                    tone: "neutral" as const,
                  },
                  {
                    legend: "SPI",
                    value: Number(p.spi).toFixed(4),
                    tone: "neutral" as const,
                  },
                ]
              : [
                  {
                    legend: "Actual",
                    value: "Belum tersedia",
                    tone: "neutral" as const,
                  },
                ]),
          ];
          return (
            <g
              key={p.date}
              className="scurve-point-group"
              tabIndex={0}
              role="graphics-symbol"
              aria-label={`Periode ${fmtAnchor(p.date)}: planned ${p.planned_pct.toFixed(1)}%`}
              onMouseEnter={(e) =>
                showTip(e, { title: fmtAnchor(p.date), rows: tipRows })
              }
              onMouseMove={moveTip}
              onFocus={(e) =>
                showTip(e as unknown as ReactMouseEvent, {
                  title: fmtAnchor(p.date),
                  rows: tipRows,
                })
              }
              onBlur={hideTip}
            >
              <rect
                x={xs[i] - (i === 0 || i === n - 1 ? 16 : 14)}
                y={padT}
                width={i === 0 || i === n - 1 ? 32 : 28}
                height={chartH}
                fill="transparent"
                className="scurve-point-hit"
              />
              <circle
                cx={xs[i]}
                cy={plannedYs[i]}
                r={5}
                className="scurve-dot-planned scurve-dot-planned--ring"
              />
              <circle cx={xs[i]} cy={plannedYs[i]} r={2.5} className="scurve-dot-planned" />
              {showActual && (
                <>
                  <circle
                    cx={xs[i]}
                    cy={y(p.actual_pct)}
                    r={5}
                    className="scurve-dot-actual scurve-dot-actual--ring"
                  />
                  <circle
                    cx={xs[i]}
                    cy={y(p.actual_pct)}
                    r={2.5}
                    className="scurve-dot-actual"
                  />
                </>
              )}
              {(i % labelEvery === 0 || i === n - 1 || i === 0) && (
                <text
                  x={xs[i]}
                  y={xLabelY}
                  textAnchor="end"
                  className="scurve-axis-label scurve-axis-label--anchor"
                  transform={`rotate(-38 ${xs[i]} ${xLabelY})`}
                >
                  {fmtAnchor(p.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </ChartZoomViewport>
      <ChartPointTooltip tip={tip} />
    </div>
  );
}

type MilestoneChartItem = {
  id: number;
  name: string;
  weight_pct: number;
  planned_pct: number;
  actual_pct: number;
};

function MilestoneChart({
  items,
  asOf,
  cutOff: _cutOff,
  statusDateReport,
  activeAnchor,
  projectCode,
  projectName,
}: {
  items: MilestoneChartItem[];
  asOf: string | null;
  cutOff: string | null;
  statusDateReport?: string | null;
  activeAnchor?: string | null;
  projectCode?: string;
  projectName?: string;
}) {
  const svgRef = useChartSvgRef();
  const { zoom, zoomIn, zoomOut, resetZoom } = useChartZoom();
  const { tip, showTip, moveTip, hideTip } = useChartTooltip();
  if (!items.length) {
    return <p className="text-muted">Belum ada milestone/phase untuk grafik progress.</p>;
  }
  const statusLabel = (statusDateReport || asOf)
    ? formatDisplayDate(statusDateReport || asOf!)
    : "—";
  const anchorLabel = activeAnchor ? formatDisplayDate(activeAnchor) : "—";
  const rowH = 36;
  const padL = 168;
  const padR = 48;
  const padB = 40;
  const chartW = 520;
  const legendH = 46;
  const plotTop = legendH + 10;
  const h = plotTop + padB + items.length * rowH;
  const w = padL + chartW + padR;
  const barH = 10;
  const gap = 4;
  const x0 = padL;
  const barMaxW = chartW;
  const plotBottom = h - padB;
  const xAxisLabelY = h - 12;
  const exportBasename = `${(projectCode || "project").replace(/\s+/g, "_")}_milestone`;
  return (
    <div className="scurve-panel scurve-panel--pro milestone-chart-panel scurve-panel--executive">
      <div className="scurve-panel__top scurve-panel__top--executive">
        <div>
          <p className="scurve-panel__kicker">Milestone progress</p>
          <h3 className="scurve-panel__title">
            {projectCode && projectName
              ? `${projectCode} — ${projectName}`
              : projectName || "Milestone chart"}
          </h3>
          <p className="scurve-panel__meta">
            <span className="scurve-meta-pill">
              Status date <strong>{statusLabel}</strong>
            </span>
            {activeAnchor && (
              <span className="scurve-meta-pill">
                Tanggal laporan aktif <strong>{anchorLabel}</strong>
              </span>
            )}
          </p>
        </div>
      </div>
      <ChartPanelToolbar
        svgRef={svgRef}
        exportBasename={exportBasename}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={resetZoom}
      />
      <ChartZoomViewport zoom={zoom}>
      <svg
        ref={svgRef}
        className="scurve-panel__chart milestone-chart-panel__chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Grafik actual vs target per milestone"
        onMouseLeave={hideTip}
      >
        <ChartInlineLegend
          x={x0}
          y={8}
          items={[
            { label: "Target (planned)", color: CHART_COLOR_PLANNED },
            { label: "Actual", color: CHART_COLOR_ACTUAL },
          ]}
        />
        {[0, 25, 50, 75, 100].map((g) => {
          const x = x0 + (g / 100) * barMaxW;
          const anchor =
            g === 0 ? "start" : g === 100 ? "end" : ("middle" as const);
          const tx = g === 100 ? x0 + barMaxW : x;
          return (
            <g key={g}>
              <line
                x1={x}
                y1={plotTop}
                x2={x}
                y2={plotBottom}
                className="scurve-grid-line"
              />
              <text
                x={tx}
                y={xAxisLabelY}
                textAnchor={anchor}
                className="scurve-axis-label scurve-axis-label--milestone-x"
              >
                {g}%
              </text>
            </g>
          );
        })}
        {items.map((m, i) => {
          const yRow = plotTop + i * rowH + rowH / 2;
          const label =
            m.name.length > 22 ? `${m.name.slice(0, 21)}…` : m.name;
          const plannedW = (Math.min(m.planned_pct, 100) / 100) * barMaxW;
          const actualW = (Math.min(m.actual_pct, 100) / 100) * barMaxW;
          const tipRows = [
            {
              legend: "Target (planned)",
              value: `${m.planned_pct.toFixed(2)}%`,
              tone: "planned" as const,
            },
            {
              legend: "Actual",
              value: `${m.actual_pct.toFixed(2)}%`,
              tone: "actual" as const,
            },
            {
              legend: "Bobot",
              value: `${m.weight_pct.toFixed(2)}%`,
              tone: "neutral" as const,
            },
          ];
          return (
            <g
              key={m.id}
              className="milestone-chart-row"
              onMouseEnter={(e) => showTip(e, { title: m.name, rows: tipRows })}
              onMouseMove={moveTip}
            >
              <rect
                x={padL - 160}
                y={yRow - rowH / 2 + 2}
                width={padL + barMaxW + 40}
                height={rowH - 4}
                fill="transparent"
                className="milestone-chart-hit"
              />
              <text
                x={padL - 8}
                y={yRow + 4}
                textAnchor="end"
                className="milestone-chart-panel__label"
                pointerEvents="none"
              >
                {label}
              </text>
              <rect
                x={x0}
                y={yRow - barH - gap}
                width={plannedW}
                height={barH}
                className="milestone-chart-panel__bar milestone-chart-panel__bar--planned"
                rx={2}
                pointerEvents="none"
              />
              <rect
                x={x0}
                y={yRow + gap}
                width={actualW}
                height={barH}
                className="milestone-chart-panel__bar milestone-chart-panel__bar--actual"
                rx={2}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      </ChartZoomViewport>
      <ChartPointTooltip tip={tip} />
    </div>
  );
}

type WeeklyReportPeriodOption = {
  report_date?: string;
  anchor_date: string;
  period_start?: string;
  cut_off_date: string;
};

function reportDateFromOption(a: WeeklyReportPeriodOption): string {
  return a.report_date ?? a.anchor_date;
}

/** Matches backend display_period_day_count (inclusive calendar days). */
function displayPeriodDayCount(periodLengthDays: number): number {
  return Math.max(1, periodLengthDays + 1);
}

function formatWeeklyPeriodOptionLabel(a: WeeklyReportPeriodOption): string {
  const rd = reportDateFromOption(a);
  const ps = a.period_start ?? rd;
  if (a.period_start && a.cut_off_date > rd) {
    return `${formatDisplayDate(ps)} – ${formatDisplayDate(rd)} (cut-off ${formatDisplayDate(a.cut_off_date)})`;
  }
  return `${formatDisplayDate(ps)} – ${formatDisplayDate(rd)}`;
}

function formatStoredWeeklyPeriod(
  weekStart: string,
  weekEnd: string,
  periodStart?: string | null,
): string {
  if (weekEnd > weekStart && (!periodStart || periodStart === weekStart)) {
    return `${formatDisplayDate(weekStart)} s/d ${formatDisplayDate(weekEnd)}`;
  }
  const ps = periodStart ?? weekStart;
  const rd = weekEnd >= weekStart ? weekEnd : weekStart;
  return `${formatDisplayDate(ps)} – ${formatDisplayDate(rd)}`;
}

function isFutureReportDate(reportDate: string, activeReportDate: string | null): boolean {
  if (!reportDate || !activeReportDate) return false;
  return reportDate > activeReportDate;
}

function isPastReportDate(reportDate: string, activeReportDate: string | null): boolean {
  if (!reportDate || !activeReportDate) return false;
  return reportDate < activeReportDate;
}

type ReportPeriodStatus = "active" | "past" | "future";

function reportPeriodStatus(
  reportDate: string,
  activeReportDate: string | null,
): ReportPeriodStatus {
  if (!activeReportDate) return "past";
  if (reportDate > activeReportDate) return "future";
  if (reportDate === activeReportDate) return "active";
  return "past";
}

function canUseWeeklyReportActions(status: ReportPeriodStatus): boolean {
  return status !== "future";
}

function reportPeriodStatusLabel(status: ReportPeriodStatus): string {
  if (status === "active") return "Aktif";
  if (status === "past") return "Selesai";
  return "Mendatang";
}

function spiTone(spi: number): "ok" | "warn" | "bad" {
  if (spi >= 1) return "ok";
  if (spi >= 0.9) return "warn";
  return "bad";
}

function weeklyPreviewMetricsLabel(source?: string): string {
  switch (source) {
    case "saved_report":
      return "Laporan tersimpan (frozen)";
    case "snapshot":
      return "Snapshot progress periode";
    case "active_live":
      return "Live — selaras health proyek (hari ini)";
    case "computed_historical":
      return "Dihitung ulang periode historis";
    default:
      return "Progress periode";
  }
}

type AuditLogRow = {
  id: number;
  action: string;
  action_label: string;
  detail: Record<string, unknown>;
  created_at: string | null;
  user_name: string | null;
  user_email: string | null;
};

function formatAuditDetail(detail: Record<string, unknown>): string {
  const keys = Object.keys(detail);
  if (!keys.length) return "—";
  return keys
    .map((k) => {
      const v = detail[k];
      if (v == null || v === "") return null;
      return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function AuditTrailTab({
  projectId,
  refreshKey,
}: {
  projectId: number;
  refreshKey: number;
}) {
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setErr("");
    api<{ items: AuditLogRow[] }>(`/projects/${projectId}/activity-log`)
      .then((r) => setItems(r.items ?? []))
      .catch((e) => {
        setErr(getErrorMessage(e));
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, refreshKey]);
  return (
    <div className="card">
      <h2 className="card-title">Audit trail</h2>
      <p className="text-muted form-hint">
        Riwayat aktivitas penting pada proyek ini (fase, SPH/PO, dokumen, progress, dll.).
      </p>
      <TabAlert message={err} variant="error" />
      {loading ? (
        <p className="text-muted">Memuat audit trail…</p>
      ) : items.length === 0 ? (
        <p className="text-muted">Belum ada entri audit.</p>
      ) : (
        <div className="table-scroll">
          <table className="audit-trail-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktivitas</th>
                <th>Pengguna</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{formatDisplayDateTime(row.created_at)}</td>
                  <td>{row.action_label}</td>
                  <td>
                    {row.user_name?.trim() ||
                      row.user_email?.trim() ||
                      "—"}
                  </td>
                  <td>
                    <span className="audit-trail-detail">
                      {formatAuditDetail(row.detail ?? {})}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RemindersTab({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<
    { type: string; severity: string; title: string; message: string }[]
  >([]);
  useEffect(() => {
    api<typeof items>(`/projects/${projectId}/reminders`).then(setItems);
  }, [projectId]);
  return (
    <div className="card">
      <h2 className="card-title">Reminder</h2>
      <ul className="plain">
        {items.map((r, i) => (
          <li key={i} className={`reminder-${r.severity}`}>
            [{r.type}] {r.message}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p>Tidak ada reminder aktif.</p>}
    </div>
  );
}

function EvaluationTab({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<
    { sph_planned_md: number; actual_md: number; variance_md: number; variance_cost: number }[]
  >([]);
  const [recap, setRecap] = useState<{
    total: number;
    closed: number;
    open: number;
    overdue: number;
    tasks: TaskRecapRow[];
    groups?: TaskRecapGroup[];
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const loadEval = () => api<typeof rows>(`/projects/${projectId}/evaluations`).then(setRows);
  const loadTasks = () =>
    api<typeof recap>(`/projects/${projectId}/tasks/recap`)
      .then(setRecap)
      .catch(() => setRecap(null));
  useEffect(() => {
    loadEval();
    loadTasks();
  }, [projectId]);
  const compute = async () => {
    await api(`/projects/${projectId}/evaluations/compute`, { method: "POST" });
    loadEval();
  };
  const syncClickUp = async () => {
    setMsg("");
    setSyncBusy(true);
    try {
      const r = await syncClickUpProgress(projectId);
      setMsg(formatClickUpSyncMessage(r));
      loadTasks();
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setSyncBusy(false);
    }
  };
  return (
    <div className="card">
      <h2 className="card-title">Task (ClickUp)</h2>
      <p className="text-muted">
        Detail task dari ClickUp; sync memperbarui cache dan progress actual proyek.
      </p>
      <TabAlert message={msg} />
      <div className="btn-group">
        <button type="button" className="primary" disabled={syncBusy} onClick={syncClickUp}>
          {syncBusy ? "Sync…" : "Sync dari ClickUp"}
        </button>
        <button type="button" onClick={compute}>
          Hitung MD (evaluasi)
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => downloadFile(`/projects/${projectId}/tasks/export`)}
        >
          Export task
        </button>
      </div>
      {syncBusy && (
        <div className="sync-progress-bar" role="progressbar" aria-busy="true" aria-label="Sinkronisasi ClickUp">
          <div className="sync-progress-bar__indeterminate" />
        </div>
      )}
      {recap && (
        <p className="text-muted">
          Total: {recap.total} · Open: {recap.open} · Closed: {recap.closed} · Overdue:{" "}
          {recap.overdue}
        </p>
      )}
      {recap && recap.tasks.length > 0 ? (
        <TaskRecapTables groups={recap.groups} tasks={recap.tasks} />
      ) : (
        <p className="text-muted">Belum ada task — aktifkan ClickUp dan Project Start / sync.</p>
      )}
      {rows[0] && (
        <p style={{ marginTop: "1rem" }}>
          Planned MD: {rows[0].sph_planned_md} · Actual: {rows[0].actual_md} · Var MD:{" "}
          {rows[0].variance_md}
        </p>
      )}
    </div>
  );
}

function DocumentsTab({
  projectId,
  detail,
}: {
  projectId: number;
  detail: ProjectDetail | null;
}) {
  const { can } = useAuth();
  const canUpload = can("documents.upload");
  const [docs, setDocs] = useState<
    { id: number; filename: string; doc_type: string; created_at: string }[]
  >([]);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [gdriveInfo, setGdriveInfo] = useState<{
    configured: boolean;
    service_account_email: string | null;
  } | null>(null);
  const load = () =>
    api<typeof docs>(`/projects/${projectId}/documents`)
      .then(setDocs)
      .catch((e) => setErr(getErrorMessage(e)));
  useEffect(() => {
    load();
    api<{ configured: boolean; service_account_email: string | null }>(
      "/integrations/google-drive",
    )
      .then(setGdriveInfo)
      .catch(() => setGdriveInfo(null));
  }, [projectId]);
  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/projects/${projectId}/documents?doc_type=${encodeURIComponent(docType)}`,
        {
          method: "POST",
          credentials: "include",
          body: fd,
        },
      );
      if (!res.ok) {
        const text = await res.text();
        let body: unknown = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = text;
        }
        throw new Error(
          formatApiError(
            res.status,
            `/projects/${projectId}/documents`,
            body,
            "Upload gagal",
          ),
        );
      }
      const body = (await res.json()) as {
        gdrive_url?: string;
        gdrive_error?: string;
      };
      setFile(null);
      if (body.gdrive_url) {
        setErr("");
      } else if (body.gdrive_error) {
        setErr(
          `Tersimpan di server PDC. Google Drive: ${body.gdrive_error}`,
        );
      }
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };
  const removeDoc = async (id: number, filename: string) => {
    if (!window.confirm(`Hapus dokumen "${filename}"?`)) return;
    setErr("");
    try {
      await api(`/projects/${projectId}/documents/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };
  const saveRepo = async () => {
    const url = prompt("Google Drive folder URL", detail?.document_repo_url ?? "");
    if (url === null) return;
    await api(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ document_repo_url: url }),
    });
  };
  return (
    <div className="card">
      <TabNoticeStack>
        <TabAlert message={err} variant="error" />
      </TabNoticeStack>
      <p>
        Repo dokumen:{" "}
        {detail?.document_repo_url ? (
          <a href={detail.document_repo_url} target="_blank" rel="noreferrer">
            GDrive
          </a>
        ) : (
          "—"
        )}{" "}
        <button type="button" onClick={saveRepo}>
          Set GDrive link
        </button>
      </p>
      <p className="text-muted form-hint">
        Link folder menentukan <strong>tujuan</strong> salinan Drive. Service account diatur di{" "}
        <Link to="/config/google-drive">Setting → Google Drive</Link>
        {gdriveInfo?.configured ? (
          <>
            {" "}
            (aktif — bagikan folder ke{" "}
            <strong>{gdriveInfo.service_account_email ?? "service account"}</strong> sebagai Editor).
          </>
        ) : (
          <> — belum dikonfigurasi; file tetap tersimpan lokal di PDC.</>
        )}
      </p>
      {canUpload && (
        <form className="doc-upload-bar" onSubmit={upload}>
          <div className="form-row">
            <label htmlFor="doc-type">Tipe dokumen</label>
            <select
              id="doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="po">PO</option>
              <option value="sph">SPH</option>
              <option value="mom">MoM</option>
              <option value="progress_report">Progress report</option>
              <option value="draft_bast">Draft BAST</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="doc-file">File</label>
            <input
              id="doc-file"
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button type="submit" className="primary" disabled={!file || uploading}>
            {uploading ? "Mengunggah…" : "Upload dokumen"}
          </button>
        </form>
      )}
      <p className="text-muted">
        Dokumen dari generate (laporan, deck) dan upload manual tampil di bawah.
      </p>
      {docs.length === 0 ? (
        <p className="text-muted">Belum ada dokumen.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipe</th>
              <th>File</th>
              <th>Diunggah</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="badge badge-indigo">{d.doc_type}</span>
                </td>
                <td>{d.filename}</td>
                <td>{formatDisplayDate(d.created_at)}</td>
                <td>
                  <div className="doc-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        previewFile(
                          `/projects/${projectId}/documents/${d.id}/preview`,
                        ).catch((e) => setErr(getErrorMessage(e)))
                      }
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        downloadFile(
                          `/projects/${projectId}/documents/${d.id}/download`,
                          d.filename,
                        ).catch((e) => setErr(getErrorMessage(e)))
                      }
                    >
                      Download
                    </button>
                    {canUpload && (
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => removeDoc(d.id, d.filename)}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type WeeklyPreview = {
  week_start: string;
  week_end: string;
  report_date?: string;
  cut_off_date?: string;
  status_date_report?: string;
  period_start?: string;
  period_length_days?: number;
  period_day_count?: number;
  target_week_start?: string;
  generate_progress_pct?: number;
  already_exists: boolean;
  existing_report_id?: number | null;
  metrics_source?: string;
  matches_project_health?: boolean;
  next_document_version?: number;
  project_code: string;
  project_name: string;
  baseline_version: number | null;
  planned_pct: number;
  actual_pct: number;
  spi: number;
  deviation_pct?: number;
  deviation_pp?: number;
  gap_pp?: number;
  rag_gap?: string | null;
  rag_schedule?: string | null;
  rag_deviation?: string | null;
  phases_current_week?: {
    name: string;
    start_date: string | null;
    target_date: string | null;
    planned_pct: number;
    actual_pct: number;
  }[];
  phases_next_week?: {
    name: string;
    start_date: string | null;
    target_date: string | null;
    planned_pct: number;
    actual_pct: number;
  }[];
  use_phase_fallback?: boolean;
  use_phase_next_fallback?: boolean;
  phase_gaps?: {
    name: string;
    planned_pct: number;
    actual_pct: number;
    gap_pp: number;
  }[];
  tasks_completed?: { name: string; status: string; due_date: string | null }[];
  tasks_next_week?: { name: string; status: string; due_date: string | null }[];
  next_period_start?: string;
  next_period_end?: string;
  highlights_draft?: string;
  health?: { status_date?: string | null };
  rag_overall: string;
  milestone_count: number;
  task_count: number;
  milestones_preview: { name: string; status: string; target_date: string }[];
  tasks_preview: { name: string; status: string; due_date: string | null }[];
  output_formats: string[];
  notes: string;
};

function formatDeviationPct(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${Number(v).toFixed(2)}%`;
}

function ragDisplayLabel(rag: string | null | undefined): string {
  if (!rag) return "—";
  const m: Record<string, string> = { green: "Green", yellow: "Yellow", red: "Red" };
  return m[rag.toLowerCase()] ?? rag;
}

function ReportsTab({
  projectId,
  projectCode,
  projectName,
  currentPhase,
  deliveryStarted,
  kickoffTimelineConfirmed,
  onProjectRefresh,
}: {
  projectId: number;
  projectCode?: string;
  projectName?: string;
  currentPhase: string;
  deliveryStarted: boolean;
  kickoffTimelineConfirmed: boolean;
  onProjectRefresh?: () => void;
}) {
  const inDelivery = deliveryStarted && DELIVERY_PHASES.has(currentPhase);
  const [reports, setReports] = useState<
    { id: number; week_start: string; week_end: string; period_label: string; has_pptx?: boolean }[]
  >([]);
  const [scurve, setScurve] = useState<
    { date: string; planned_pct: number; actual_pct: number; spi: number }[]
  >([]);
  const [anchorOptions, setAnchorOptions] = useState<WeeklyReportPeriodOption[]>([]);
  const [targetWeek, setTargetWeek] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<WeeklyPreview | null>(null);
  const [previewNotes, setPreviewNotes] = useState("");
  const [previewMitigation, setPreviewMitigation] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewLoadingDate, setPreviewLoadingDate] = useState<string | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [weeklyCfg, setWeeklyCfg] = useState({
    weekly_report_anchor_weekday: 4,
    weekly_report_cutoff_offset_days: 0,
    weekly_report_first_anchor_date: "",
  });
  const [anchorMeta, setAnchorMeta] = useState<{
    project_start_date: string | null;
    schedule_end: string | null;
    min_first_anchor_date: string | null;
  }>({ project_start_date: null, schedule_end: null, min_first_anchor_date: null });
  const [activeReportAnchor, setActiveReportAnchor] = useState<string | null>(null);
  const [statusDateReport, setStatusDateReport] = useState<string | null>(null);
  const [, setActivePeriodStart] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"scurve" | "milestone">("scurve");
  const [milestoneChart, setMilestoneChart] = useState<{
    as_of: string | null;
    cut_off_date: string | null;
    status_date_report?: string | null;
    active_report_date?: string | null;
    active_anchor_date?: string | null;
    items: MilestoneChartItem[];
  }>({ as_of: null, cut_off_date: null, items: [] });
  const [targetAnchors, setTargetAnchors] = useState<
    {
      report_date?: string;
      period_start?: string;
      anchor_date: string;
      cut_off_date: string;
      planned_cumulative_pct?: number;
    }[]
  >([]);
  const [scheduleMsg, setScheduleMsg] = useState("");
  const loadScurve = () =>
    api<typeof scurve>(`/projects/${projectId}/schedule/scurve`)
      .then((pts) => {
        setScurve(pts);
      })
      .catch(() => setScurve([]));
  const loadMilestoneChart = () =>
    api<typeof milestoneChart>(`/projects/${projectId}/schedule/milestone-chart`)
      .then(setMilestoneChart)
      .catch(() => setMilestoneChart({ as_of: null, cut_off_date: null, items: [] }));
  const showScurveChart =
    kickoffTimelineConfirmed ||
    inDelivery ||
    targetAnchors.length > 0 ||
    scurve.length > 0;
  const load = () =>
    api<typeof reports>(`/projects/${projectId}/weekly-reports`).then(setReports);
  useEffect(() => {
    load().catch((e) => setErr(getErrorMessage(e)));
    api<{
      weekly_report_anchor_weekday?: number;
      weekly_report_cutoff_offset_days?: number;
      weekly_report_first_anchor_date?: string | null;
      report_weekday?: number;
      period_length_days?: number;
      first_report_date?: string | null;
    }>(`/projects/${projectId}`)
      .then((p) =>
        setWeeklyCfg({
          weekly_report_anchor_weekday: p.report_weekday ?? p.weekly_report_anchor_weekday ?? 4,
          weekly_report_cutoff_offset_days:
            p.period_length_days ?? p.weekly_report_cutoff_offset_days ?? 0,
          weekly_report_first_anchor_date: toDateInputValue(
            p.first_report_date ?? p.weekly_report_first_anchor_date,
          ),
        }),
      )
      .catch(() => {});
    const loadAnchorMeta = () =>
      api<{
        anchors: WeeklyReportPeriodOption[];
        anchors_started?: WeeklyReportPeriodOption[];
        project_start_date?: string | null;
        schedule_end?: string | null;
        active_report_date?: string | null;
        active_anchor_date?: string | null;
        status_date_report?: string | null;
        active_period_start?: string | null;
        min_first_report_date?: string | null;
        min_first_anchor_date?: string | null;
      }>(`/projects/${projectId}/schedule/report-anchors`)
        .then((r) => {
          const full = r.anchors ?? [];
          const started = r.anchors_started ?? full;
          setActiveReportAnchor(r.active_report_date ?? r.active_anchor_date ?? null);
          setStatusDateReport(r.status_date_report ?? null);
          setActivePeriodStart(r.active_period_start ?? null);
          setAnchorMeta({
            project_start_date: r.project_start_date ?? null,
            schedule_end: r.schedule_end ?? null,
            min_first_anchor_date: r.min_first_report_date ?? r.min_first_anchor_date ?? null,
          });
          setAnchorOptions(full);
          if (started.length) {
            const today = new Date().toISOString().slice(0, 10);
            const past = started.filter((a) => reportDateFromOption(a) <= today);
            const pick = past.length
              ? reportDateFromOption(past[past.length - 1])
              : reportDateFromOption(started[0]);
            setTargetWeek((prev) => prev || pick);
          }
        })
        .catch(() => setAnchorOptions([]));
    loadAnchorMeta();
    if (kickoffTimelineConfirmed || inDelivery) {
      loadScurve();
      loadMilestoneChart();
    }
  }, [projectId, kickoffTimelineConfirmed, inDelivery]);
  const rejectFutureWeeklyPeriod = (reportDate: string): string | null => {
    if (!reportDate) return "Pilih tanggal laporan weekly report.";
    if (isFutureReportDate(reportDate, activeReportAnchor)) {
      return `[Data tidak valid] Periode belum dimulai — pilih tanggal laporan pada atau sebelum minggu aktif (${formatDisplayDate(activeReportAnchor)}).`;
    }
    return null;
  };

  const anchorByReportDate = useMemo(() => {
    const m = new Map<string, WeeklyReportPeriodOption>();
    for (const a of anchorOptions) {
      m.set(reportDateFromOption(a), a);
    }
    return m;
  }, [anchorOptions]);

  const reportByWeekStart = useMemo(() => {
    const m = new Map<string, { id: number; has_pptx: boolean }>();
    for (const r of reports) {
      m.set(r.week_start, { id: r.id, has_pptx: Boolean(r.has_pptx) });
    }
    return m;
  }, [reports]);

  const openPreviewForReportDate = async (reportDate: string) => {
    setErr("");
    const periodErr = rejectFutureWeeklyPeriod(reportDate);
    if (periodErr) {
      setErr(periodErr);
      return;
    }
    setPreviewLoadingDate(reportDate);
    setTargetWeek(reportDate);
    try {
      const qs = `?anchor_date=${encodeURIComponent(reportDate)}`;
      const p = await api<WeeklyPreview>(`/projects/${projectId}/weekly-reports/preview${qs}`);
      setPreviewNotes(p.highlights_draft || p.notes || "");
      setPreviewMitigation("");
      setPreview(p);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setPreviewLoadingDate(null);
    }
  };

  const openPreview = async () => {
    const rd = targetWeek || activeReportAnchor;
    if (!rd) {
      setErr("Pilih periode weekly report terlebih dahulu.");
      return;
    }
    await openPreviewForReportDate(rd);
  };

  const generateWeeklyDoc = async (reportDate: string, regenerate: boolean) => {
    setErr("");
    const periodErr = rejectFutureWeeklyPeriod(reportDate);
    if (periodErr) {
      setErr(periodErr);
      return;
    }
    if (!inDelivery) return;
    const verHint = regenerate ? " versi baru" : "";
    if (
      !window.confirm(
        `Generate dokumen weekly report${verHint} untuk tanggal laporan ${formatDisplayDate(reportDate)} ke tab Documents?`,
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await api<{ document_version?: number }>(
        `/projects/${projectId}/weekly-reports/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            anchor_date: reportDate,
            regenerate,
            notes: previewNotes.trim() || undefined,
            mitigation_plan: previewMitigation.trim() || undefined,
          }),
        },
      );
      setTargetWeek(reportDate);
      setMsg(
        `Dokumen weekly report v${String(res.document_version ?? 1).padStart(2, "0")} tersimpan di Documents.`,
      );
      load();
      loadScurve();
      onProjectRefresh?.();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };
  const saveProgressWeek = async () => {
    if (isPastReportDate(targetWeek, activeReportAnchor)) {
      setErr(
        `[Data tidak valid] Progress snapshot hanya untuk minggu laporan aktif (${formatDisplayDate(activeReportAnchor)}), bukan periode yang sudah lewat.`,
      );
      return;
    }
    const periodErr = rejectFutureWeeklyPeriod(targetWeek);
    if (periodErr) {
      setErr(periodErr);
      return;
    }
    setProgressBusy(true);
    setErr("");
    try {
      await api(`/projects/${projectId}/schedule/progress/weeks/${targetWeek}/save`, {
        method: "POST",
      });
      setMsg("Progress mingguan disimpan (snapshot).");
      api<typeof scurve>(`/projects/${projectId}/schedule/scurve`).then(setScurve);
      onProjectRefresh?.();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setProgressBusy(false);
    }
  };
  const confirmGenerate = async () => {
    if (!preview) return;
    setGenerating(true);
    setErr("");
    try {
      await api(`/projects/${projectId}/weekly-reports/generate`, {
        method: "POST",
        body: JSON.stringify({
          anchor_date: preview.week_start,
          regenerate: preview.already_exists,
          notes: previewNotes,
          mitigation_plan: previewMitigation.trim() || null,
        }),
      });
      setPreview(null);
      load();
      loadScurve();
      onProjectRefresh?.();
      setErr("");
      setMsg("Dokumen weekly report tersimpan. Lihat tab DOCUMENTS.");
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };
  const dl = async (path: string) => {
    setErr("");
    try {
      await downloadFile(path);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };
  const validateFirstWeeklyAnchor = (): string | null => {
    const first = weeklyCfg.weekly_report_first_anchor_date.trim();
    if (!first) return null;
    if (
      anchorMeta.min_first_anchor_date &&
      first < anchorMeta.min_first_anchor_date
    ) {
      return `[Data tidak valid] Tanggal laporan pertama harus ≥ tanggal laporan pertama setelah project start (${formatDisplayDate(anchorMeta.min_first_anchor_date)}).`;
    }
    const d = new Date(`${first}T12:00:00`);
    const wd = (d.getDay() + 6) % 7;
    if (wd !== weeklyCfg.weekly_report_anchor_weekday) {
      const label =
        WEEKDAY_OPTS.find((o) => o.v === weeklyCfg.weekly_report_anchor_weekday)?.label ??
        "hari laporan";
      return `[Data tidak valid] Tanggal laporan pertama harus jatuh pada hari ${label}.`;
    }
    return null;
  };
  const saveWeeklyCfg = async () => {
    setScheduleMsg("");
    const vErr = validateFirstWeeklyAnchor();
    if (vErr) {
      setScheduleMsg(vErr);
      return;
    }
    try {
      await api(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          report_weekday: weeklyCfg.weekly_report_anchor_weekday,
          period_length_days: weeklyCfg.weekly_report_cutoff_offset_days,
          first_report_date: weeklyCfg.weekly_report_first_anchor_date.trim() || null,
        }),
      });
      setScheduleMsg("Jadwal laporan disimpan.");
      api<{
        anchors: WeeklyReportPeriodOption[];
        project_start_date?: string | null;
        schedule_end?: string | null;
        min_first_report_date?: string | null;
        min_first_anchor_date?: string | null;
        active_report_date?: string | null;
        active_anchor_date?: string | null;
      }>(`/projects/${projectId}/schedule/report-anchors`)
        .then((r) => {
          setAnchorOptions(r.anchors ?? []);
          setActiveReportAnchor(r.active_report_date ?? r.active_anchor_date ?? null);
          setAnchorMeta({
            project_start_date: r.project_start_date ?? null,
            schedule_end: r.schedule_end ?? null,
            min_first_anchor_date: r.min_first_report_date ?? r.min_first_anchor_date ?? null,
          });
        })
        .catch(() => {});
    } catch (e) {
      setScheduleMsg(getErrorMessage(e));
    }
  };
  const generateAnchorTargets = async () => {
    setScheduleMsg("");
    const vErr = validateFirstWeeklyAnchor();
    if (vErr) {
      setScheduleMsg(vErr);
      return;
    }
    try {
      const r = await api<{
        anchors: {
          report_date?: string;
          period_start?: string;
          anchor_date: string;
          cut_off_date: string;
          planned_cumulative_pct: number;
        }[];
        count: number;
        created?: number;
        updated?: number;
        range_start: string;
        schedule_end: string;
      }>(`/projects/${projectId}/schedule/report-anchors/generate`, { method: "POST" });
      setTargetAnchors(r.anchors ?? []);
      setAnchorOptions(
        (r.anchors ?? []).map((a) => ({
          report_date: a.report_date ?? a.anchor_date,
          anchor_date: a.anchor_date,
          period_start: a.period_start,
          cut_off_date: a.cut_off_date,
        })),
      );
      loadScurve();
      loadMilestoneChart();
      setScheduleMsg(
        `${r.count} target weekly report — planned kumulatif ${r.created ?? 0} baru, ${r.updated ?? 0} diperbarui (${formatDisplayDate(r.range_start)} s.d. ${formatDisplayDate(r.schedule_end)}).`,
      );
    } catch (e) {
      setScheduleMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card">
      <TabNoticeStack>
        <TabAlert message={err} variant="error" />
        <TabAlert message={scheduleMsg} />
        <TabAlert message={msg} />
      </TabNoticeStack>
      <section className="weekly-schedule-card">
        <h2 className="card-title">Weekly report & S-curve</h2>
        <p className="text-muted">
          Hari laporan dan panjang periode (mundur dari tanggal laporan) menentukan rentang mingguan
          dan titik planned S-curve. Tanggal laporan pertama opsional; generate target menghitung
          semua periode sampai akhir proyek.
        </p>
        {(anchorMeta.project_start_date || anchorMeta.schedule_end) && (
          <p className="text-muted form-hint weekly-schedule-bounds">
            Timeline start: {formatDisplayDate(anchorMeta.project_start_date)} · Selesai proyek
            (target terakhir): {formatDisplayDate(anchorMeta.schedule_end)}
            {anchorMeta.min_first_anchor_date && (
              <>
                {" "}
                · Tanggal laporan pertama (setelah project start):{" "}
                <strong>{formatDisplayDate(anchorMeta.min_first_anchor_date)}</strong>
              </>
            )}
          </p>
        )}
        <div className="weekly-schedule-panel sph-info-panel">
          <div className="sph-info-grid weekly-schedule-grid">
            <div className="form-row">
              <label htmlFor="wr-anchor-weekday">Hari laporan (report weekday)</label>
              <select
                id="wr-anchor-weekday"
                className="sph-info-input"
                value={weeklyCfg.weekly_report_anchor_weekday}
                onChange={(e) =>
                  setWeeklyCfg({
                    ...weeklyCfg,
                    weekly_report_anchor_weekday: Number(e.target.value),
                  })
                }
              >
                {WEEKDAY_OPTS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="wr-cutoff">
                Panjang periode (period length, hari mundur dari tanggal laporan)
              </label>
              <input
                id="wr-cutoff"
                type="number"
                min={0}
                className="sph-info-input"
                value={weeklyCfg.weekly_report_cutoff_offset_days}
                onChange={(e) =>
                  setWeeklyCfg({
                    ...weeklyCfg,
                    weekly_report_cutoff_offset_days: Number(e.target.value),
                  })
                }
              />
              <p className="form-hint" style={{ margin: "0.35rem 0 0" }}>
                ≈ {displayPeriodDayCount(weeklyCfg.weekly_report_cutoff_offset_days)} hari kalender
                (inklusif) per periode laporan.
              </p>
            </div>
            <div className="form-row sph-info-grid__full">
              <label htmlFor="wr-first-anchor">Tanggal laporan pertama (opsional)</label>
              <input
                id="wr-first-anchor"
                type="date"
                className="sph-info-input"
                value={weeklyCfg.weekly_report_first_anchor_date}
                onChange={(e) =>
                  setWeeklyCfg({
                    ...weeklyCfg,
                    weekly_report_first_anchor_date: e.target.value,
                  })
                }
              />
              <p className="form-hint" style={{ margin: "0.35rem 0 0" }}>
                Jika diisi, harus ≥ tanggal laporan pertama setelah project start dan jatuh pada
                hari laporan. Kosongkan = otomatis setelah project start. Planned
                kumulatif = Σ (bobot phase × progress phase); progress phase = hari kerja elapsed ÷
                total hari kerja phase (0–100%).
              </p>
            </div>
          </div>
          <div className="ui-toolbar weekly-schedule-actions">
            <button type="button" className="primary" onClick={() => void saveWeeklyCfg()}>
              Simpan jadwal laporan
            </button>
            <button type="button" onClick={() => void generateAnchorTargets()}>
              Generate target weekly report
            </button>
          </div>
        </div>
        {targetAnchors.length > 0 && (
          <div className="weekly-target-anchors">
            <h3 className="subsection-title">Target weekly report</h3>
            <p className="text-muted form-hint">
              {targetAnchors.length} periode s.d. akhir proyek — planned kumulatif 100% pada
              periode terakhir.
            </p>
            <div className="weekly-target-anchors__scroll">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tanggal laporan</th>
                    <th>Periode</th>
                    <th className="num">Planned kumulatif (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {targetAnchors.map((a, i) => (
                    <tr key={a.anchor_date}>
                      <td>{i + 1}</td>
                      <td>{formatDisplayDate(a.report_date ?? a.anchor_date)}</td>
                      <td>
                        {formatWeeklyPeriodOptionLabel({
                          report_date: a.report_date,
                          anchor_date: a.anchor_date,
                          period_start: a.period_start,
                          cut_off_date: a.cut_off_date,
                        })}
                      </td>
                      <td className="num">
                        {a.planned_cumulative_pct != null
                          ? Number(a.planned_cumulative_pct).toFixed(2)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <hr className="card-divider" />
      <ProjectRagConfig projectId={projectId} />
      <hr className="card-divider" />
      <section className="scurve-section">
        <div className="scurve-section__head">
          <h2 className="card-title">S-Curve</h2>
          {showScurveChart && (
            <div className="scurve-chart-toggle" role="tablist" aria-label="Jenis grafik">
              <button
                type="button"
                role="tab"
                aria-selected={chartView === "scurve"}
                className={chartView === "scurve" ? "is-active" : ""}
                onClick={() => setChartView("scurve")}
              >
                Grafik S-curve
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chartView === "milestone"}
                className={chartView === "milestone" ? "is-active" : ""}
                onClick={() => {
                  setChartView("milestone");
                  void loadMilestoneChart();
                }}
              >
                Grafik milestone
              </button>
            </div>
          )}
        </div>
        {!showScurveChart && (
          <p className="text-muted">
            S-curve planned tampil setelah timeline kick off dikonfirmasi dan Anda menjalankan
            Generate target weekly report (atau saat proyek sudah masuk delivery).
          </p>
        )}
        {showScurveChart && chartView === "scurve" && (
          <ScurveChart
            points={scurve}
            activeAnchor={activeReportAnchor}
            statusDateReport={statusDateReport}
            projectCode={projectCode}
            projectName={projectName}
          />
        )}
        {showScurveChart && chartView === "milestone" && (
          <MilestoneChart
            items={milestoneChart.items}
            asOf={milestoneChart.as_of}
            cutOff={milestoneChart.cut_off_date}
            statusDateReport={
              milestoneChart.status_date_report ?? statusDateReport
            }
            activeAnchor={
              milestoneChart.active_report_date ??
              milestoneChart.active_anchor_date ??
              activeReportAnchor
            }
            projectCode={projectCode}
            projectName={projectName}
          />
        )}
        {showScurveChart && chartView === "scurve" && scurve.length > 0 && (
          <div className="scurve-period-table-wrap">
            <div className="scurve-period-table__head">
              <h3 className="subsection-title">Periode weekly report</h3>
              <p className="text-muted scurve-period-table__subtitle">
                Preview atau generate laporan per baris. Periode mendatang tidak dapat diproses
                hingga periode dimulai.
              </p>
            </div>
            <div className="scurve-period-table__scroll">
              <table className="data-table scurve-period-table">
                <thead>
                  <tr>
                    <th>Tanggal laporan</th>
                    <th>Periode</th>
                    <th>Status</th>
                    <th className="num">Planned</th>
                    <th className="num">Actual</th>
                    <th className="num">SPI</th>
                    <th>Laporan</th>
                    <th className="scurve-period-table__actions-col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {scurve.map((p) => {
                    const rd = p.date;
                    const status = reportPeriodStatus(rd, activeReportAnchor);
                    const actionsOk = canUseWeeklyReportActions(status) && inDelivery;
                    const periodOpt = anchorByReportDate.get(rd);
                    const periodLabel = periodOpt
                      ? formatWeeklyPeriodOptionLabel(periodOpt)
                      : formatDisplayDate(rd);
                    const savedReport = reportByWeekStart.get(rd);
                    const hasReport = Boolean(savedReport);
                    const rowBusy = previewLoadingDate === rd;
                    const spi = Number(p.spi);
                    return (
                      <tr
                        key={rd}
                        className={
                          status === "active"
                            ? "scurve-period-table__row scurve-period-table__row--active"
                            : status === "future"
                              ? "scurve-period-table__row scurve-period-table__row--future"
                              : "scurve-period-table__row"
                        }
                      >
                        <td className="scurve-period-table__date">
                          <span className="scurve-period-table__date-main">
                            {formatDisplayDate(rd)}
                          </span>
                        </td>
                        <td className="scurve-period-table__period">{periodLabel}</td>
                        <td>
                          <span
                            className={`scurve-period-status scurve-period-status--${status}`}
                          >
                            {reportPeriodStatusLabel(status)}
                          </span>
                        </td>
                        <td className="num">{Number(p.planned_pct).toFixed(2)}%</td>
                        <td className="num">{Number(p.actual_pct).toFixed(2)}%</td>
                        <td className="num">
                          <span className={`scurve-spi-pill scurve-spi-pill--${spiTone(spi)}`}>
                            {spi.toFixed(4)}
                          </span>
                        </td>
                        <td className="scurve-period-table__report">
                          {savedReport ? (
                            <span className="scurve-report-links">
                              <a
                                href={`/api/projects/${projectId}/weekly-reports/${savedReport.id}/download`}
                                className="scurve-report-link"
                                title="Unduh laporan Excel"
                                onClick={(e) => {
                                  e.preventDefault();
                                  void dl(
                                    `/projects/${projectId}/weekly-reports/${savedReport.id}/download`,
                                  );
                                }}
                              >
                                XLS
                              </a>
                              {savedReport.has_pptx ? (
                                <a
                                  href={`/api/projects/${projectId}/weekly-reports/${savedReport.id}/download-pptx`}
                                  className="scurve-report-link"
                                  title="Unduh presentasi PowerPoint"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    void dl(
                                      `/projects/${projectId}/weekly-reports/${savedReport.id}/download-pptx`,
                                    );
                                  }}
                                >
                                  PPTX
                                </a>
                              ) : null}
                            </span>
                          ) : (
                            <span className="scurve-report-chip scurve-report-chip--none">
                              Belum ada
                            </span>
                          )}
                        </td>
                        <td className="scurve-period-table__actions">
                          <div className="scurve-row-actions">
                            <button
                              type="button"
                              className="scurve-row-actions__btn"
                              disabled={!actionsOk || rowBusy || generating}
                              title={
                                !inDelivery
                                  ? "Weekly report aktif setelah fase delivery"
                                  : status === "future"
                                    ? "Periode belum dimulai"
                                    : "Preview isi laporan minggu ini"
                              }
                              onClick={() => void openPreviewForReportDate(rd)}
                            >
                              {rowBusy ? "…" : "Preview"}
                            </button>
                            <button
                              type="button"
                              className="scurve-row-actions__btn scurve-row-actions__btn--primary"
                              disabled={!actionsOk || rowBusy || generating}
                              title={
                                !inDelivery
                                  ? "Weekly report aktif setelah fase delivery"
                                  : status === "future"
                                    ? "Periode belum dimulai"
                                    : hasReport
                                      ? "Buat versi dokumen baru di Documents"
                                      : "Generate dokumen ke Documents"
                              }
                              onClick={() => void generateWeeklyDoc(rd, hasReport)}
                            >
                              {generating ? "…" : hasReport ? "Generate v+" : "Generate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <h2 className="card-title" style={{ marginTop: "1.5rem" }}>
        Weekly report
      </h2>
      <div className="weekly-report-controls">
        {!inDelivery && (
          <p className="text-muted">Weekly report & progress snapshot aktif setelah fase delivery.</p>
        )}
        <div className="form-row">
          <label htmlFor="wr-target-week">Periode weekly report (tanggal laporan)</label>
          <select
            id="wr-target-week"
            value={targetWeek}
            onChange={(e) => setTargetWeek(e.target.value)}
          >
            <option value="">— pilih periode —</option>
            {anchorOptions.map((a) => {
              const rd = reportDateFromOption(a);
              const future = isFutureReportDate(rd, activeReportAnchor);
              const past = isPastReportDate(rd, activeReportAnchor);
              return (
                <option key={rd} value={rd} disabled={future}>
                  {formatWeeklyPeriodOptionLabel(a)}
                  {future ? " — belum dimulai" : past ? " — sudah lewat (snapshot nonaktif)" : ""}
                </option>
              );
            })}
          </select>
        </div>
        {anchorOptions.length === 0 && (
          <p className="text-muted">
            Belum ada periode — simpan jadwal laporan di atas; timeline kick off memperkaya rentang
            tanggal.
          </p>
        )}
        <div className="btn-group">
          <button
            type="button"
            onClick={saveProgressWeek}
            disabled={
              progressBusy ||
              !inDelivery ||
              !targetWeek ||
              targetWeek !== activeReportAnchor
            }
            title={
              targetWeek && activeReportAnchor && targetWeek !== activeReportAnchor
                ? "Snapshot hanya untuk minggu laporan aktif"
                : undefined
            }
          >
            Generate progress (snapshot)
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void openPreview()}
            disabled={!inDelivery || (!targetWeek && !activeReportAnchor)}
          >
            Preview periode terpilih
          </button>
        </div>
      </div>
      {preview && (
        <div className="modal-overlay weekly-preview-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card--weekly-preview weekly-preview-modal">
            <header className="weekly-preview-modal__header">
              <div>
                <p className="weekly-preview-modal__kicker">Weekly progress report</p>
                <h2 className="weekly-preview-modal__title">
                  {preview.project_code} — {preview.project_name}
                </h2>
              </div>
              <button
                type="button"
                className="weekly-preview-modal__close"
                aria-label="Tutup"
                onClick={() => setPreview(null)}
              >
                ×
              </button>
            </header>
            <div className="weekly-preview-modal__scroll">
            <div className="weekly-preview-modal__banner">
              <div>
                <span className="weekly-preview-modal__label">Tanggal laporan</span>
                <strong>
                  {formatDisplayDate(
                    preview.report_date ?? preview.week_end ?? preview.week_start,
                  )}
                </strong>
              </div>
              <div>
                <span className="weekly-preview-modal__label">Periode</span>
                <strong>
                  {formatStoredWeeklyPeriod(
                    preview.week_start,
                    preview.week_end,
                    preview.period_start ?? preview.target_week_start,
                  )}
                </strong>
                {preview.period_day_count != null && (
                  <span className="text-muted"> · {preview.period_day_count} hari</span>
                )}
              </div>
              <div>
                <span className="weekly-preview-modal__label">Status date</span>
                <strong>
                  {formatDisplayDate(
                    preview.status_date_report ??
                      preview.health?.status_date ??
                      preview.report_date ??
                      preview.week_end,
                  )}
                </strong>
              </div>
            </div>
            <p className="weekly-preview-modal__source">
              <span className="weekly-preview-modal__source-pill">
                {weeklyPreviewMetricsLabel(preview.metrics_source)}
              </span>
              {preview.matches_project_health && (
                <span className="weekly-preview-modal__health-sync">
                  Selaras dengan health proyek (hari ini)
                </span>
              )}
            </p>
            {preview.already_exists && (
              <TabAlert
                message={`Dokumen sudah pernah digenerate. Generate dari modal membuat versi v${String(preview.next_document_version ?? 2).padStart(2, "0")} di Documents.`}
                variant="info"
              />
            )}
            <div className="weekly-preview-modal__kpis">
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">Planned</span>
                <span className="weekly-preview-kpi__value">
                  {Number(preview.planned_pct).toFixed(2)}%
                </span>
              </div>
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">Actual</span>
                <span className="weekly-preview-kpi__value">
                  {Number(preview.actual_pct).toFixed(2)}%
                </span>
              </div>
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">Deviasi</span>
                <span
                  className={`weekly-preview-kpi__value ${
                    (preview.deviation_pct ?? preview.deviation_pp ?? 0) < 0
                      ? "weekly-preview-kpi__value--warn"
                      : "weekly-preview-kpi__value--ok"
                  }`}
                >
                  {formatDeviationPct(preview.deviation_pct ?? preview.deviation_pp)}
                </span>
              </div>
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">SPI</span>
                <span
                  className={`weekly-preview-kpi__value weekly-preview-kpi__value--spi scurve-spi-pill scurve-spi-pill--${spiTone(Number(preview.spi ?? 0))}`}
                >
                  {Number(preview.spi ?? 0).toFixed(4)}
                </span>
              </div>
            </div>
            <div className="weekly-preview-modal__meta">
              <span className={`rag rag-${preview.rag_overall}`}>
                RAG {ragDisplayLabel(preview.rag_overall)}
              </span>
              {preview.rag_schedule && (
                <span className={`rag rag-${preview.rag_schedule}`}>
                  Schedule {ragDisplayLabel(preview.rag_schedule)}
                </span>
              )}
              <span className="text-muted">
                Baseline v{preview.baseline_version ?? "—"} · {preview.task_count} task ·{" "}
                {preview.milestone_count} milestone ·{" "}
                {preview.output_formats.map((f) => f.toUpperCase()).join(" + ")}
              </span>
            </div>
            <div className="weekly-preview-modal__body">
            <section className="weekly-preview-block">
              <h3 className="weekly-preview-block__title">GAP phase timeline</h3>
              {preview.phase_gaps?.length ? (
                <ul className="weekly-preview-list">
                  {preview.phase_gaps.map((g) => (
                    <li key={g.name}>
                      <strong>{g.name}</strong> — target {g.planned_pct.toFixed(1)}% vs actual{" "}
                      {g.actual_pct.toFixed(1)}%
                      <span className="weekly-preview-gap"> (−{g.gap_pp.toFixed(1)} p.p.)</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted weekly-preview-empty">
                  Tidak ada phase dengan ketinggalan signifikan vs target timeline.
                </p>
              )}
            </section>
            <div className="weekly-preview-columns">
              <section className="weekly-preview-block">
                <h3 className="weekly-preview-block__title">Task selesai minggu ini</h3>
                {preview.use_phase_fallback && !preview.tasks_completed?.length && (
                  <p className="text-muted weekly-preview-period">Task tidak terdeteksi — tampil fase aktif.</p>
                )}
                {preview.tasks_completed?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.tasks_completed.map((t) => (
                      <li key={t.name}>
                        {t.name}
                        <span className="text-muted">
                          {" "}
                          · {t.status}
                          {t.due_date ? ` · due ${formatDisplayDate(t.due_date)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : preview.use_phase_fallback && preview.phases_current_week?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.phases_current_week.map((p) => (
                      <li key={p.name}>
                        <strong>{p.name}</strong>
                        <span className="text-muted">
                          {" "}
                          · target {p.planned_pct.toFixed(1)}% · actual {p.actual_pct.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted weekly-preview-empty">Belum terdeteksi di periode ini.</p>
                )}
              </section>
              <section className="weekly-preview-block">
                <h3 className="weekly-preview-block__title">Task minggu depan</h3>
                {preview.use_phase_next_fallback && !preview.tasks_next_week?.length && (
                  <p className="text-muted weekly-preview-period">Task tidak terdeteksi — tampil fase rencana.</p>
                )}
                {preview.next_period_start && preview.next_period_end && (
                  <p className="text-muted weekly-preview-period">
                    {formatDisplayDate(preview.next_period_start)} —{" "}
                    {formatDisplayDate(preview.next_period_end)}
                  </p>
                )}
                {preview.tasks_next_week?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.tasks_next_week.map((t) => (
                      <li key={t.name}>
                        {t.name}
                        <span className="text-muted">
                          {" "}
                          · {t.status}
                          {t.due_date ? ` · due ${formatDisplayDate(t.due_date)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : preview.use_phase_next_fallback && preview.phases_next_week?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.phases_next_week.map((p) => (
                      <li key={p.name}>
                        <strong>{p.name}</strong>
                        <span className="text-muted">
                          {" "}
                          ·{" "}
                          {p.start_date ? formatDisplayDate(p.start_date) : "—"} —{" "}
                          {p.target_date ? formatDisplayDate(p.target_date) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted weekly-preview-empty">Belum terdeteksi dari ClickUp.</p>
                )}
              </section>
            </div>
            </div>
            <footer className="weekly-preview-modal__footer">
            <div className="form-row">
              <label htmlFor="wr-mitigation">Mitigasi mengejar plan</label>
              <p className="text-muted form-hint">
                Isi manual rencana recovery sebelum generate — disimpan ke ringkasan laporan dan file
                Excel (sheet Ringkasan / placeholder template).
              </p>
              <textarea
                id="wr-mitigation"
                rows={4}
                value={previewMitigation}
                onChange={(e) => setPreviewMitigation(e.target.value)}
                placeholder="Contoh: tambah resource di fase X, percepat UAT, eskalasi blocker integrasi…"
              />
            </div>
            <div className="form-row">
              <label htmlFor="wr-notes">Catatan highlights</label>
              <p className="text-muted form-hint">
                Draft otomatis (GAP phase, task selesai, rencana minggu depan) — dapat diedit sebelum
                disimpan.
              </p>
              <textarea
                id="wr-notes"
                rows={8}
                value={previewNotes}
                onChange={(e) => setPreviewNotes(e.target.value)}
              />
            </div>
            <div className="btn-group">
              <button
                type="button"
                className="primary"
                disabled={generating}
                onClick={confirmGenerate}
              >
                {preview.already_exists
                  ? `Generate dokumen v${String(preview.next_document_version ?? 2).padStart(2, "0")}`
                  : "Generate dokumen ke Documents"}
              </button>
              <button type="button" onClick={() => setPreview(null)} disabled={generating}>
                Tutup
              </button>
            </div>
            </footer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type BastCriterion = { id: string; label: string; done: boolean };

function parseBastItems(raw: Record<string, unknown>): BastCriterion[] {
  const items = raw?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it, index) => {
      if (!it || typeof it !== "object") return null;
      const o = it as { id?: string; label?: string; done?: boolean };
      const label = (o.label ?? "").trim();
      if (!label) return null;
      return {
        id: o.id ?? `bast-${index}`,
        label,
        done: Boolean(o.done),
      };
    })
    .filter((x): x is BastCriterion => x !== null);
}

function ClosingProjectTab({
  projectId,
  detail,
  checklist,
  onSaved,
}: {
  projectId: number;
  detail: ProjectDetail;
  checklist: Record<string, unknown>;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<BastCriterion[]>(() => parseBastItems(checklist));
  const [newLabel, setNewLabel] = useState("");
  const [msg, setMsg] = useState("");
  const progress = detail.health?.actual_progress_pct ?? 0;
  const isClosed = detail.status === "closed" || detail.current_phase === "closed";

  useEffect(() => {
    setItems(parseBastItems(checklist));
  }, [checklist]);

  const addCriterion = () => {
    const label = newLabel.trim();
    if (!label) return;
    setItems([
      ...items,
      { id: newId(), label, done: false },
    ]);
    setNewLabel("");
  };

  const removeCriterion = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const allDone = items.length > 0 && items.every((i) => i.done);
  const canClose = allDone && progress >= 100 && !isClosed;

  const closeProject = async () => {
    setMsg("");
    try {
      await saveChecklistSilent();
      await api(`/projects/${projectId}/close`, { method: "POST" });
      setMsg("Proyek ditandai sebagai closed / completed.");
      onSaved();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  const saveChecklistSilent = async () => {
    await api(`/projects/${projectId}/bast`, {
      method: "PATCH",
      body: JSON.stringify({
        bast_checklist: {
          items: items.map(({ id, label, done }) => ({ id, label, done })),
        },
      }),
    });
  };

  const save = async () => {
    setMsg("");
    try {
      await saveChecklistSilent();
      setMsg("Checklist BAST disimpan.");
      onSaved();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Closing project</h2>
      {isClosed && (
        <p>
          Status: <span className="badge badge-indigo">Closed / Completed</span>
        </p>
      )}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Progress actual</div>
          <div className="kpi-value">{progress}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Checklist BAST</div>
          <div className="kpi-value">
            {items.filter((i) => i.done).length}/{items.length}
          </div>
        </div>
      </div>
      <p className="text-muted">
        Checklist default: <strong>Data PO lengkap (BAST)</strong> dan{" "}
        <strong>Progress Proyek 100%</strong>. Syarat yang sama berlaku sebelum lanjut ke fase BAST
        (ditambah minimal 1 weekly report). Closing: centang semua kriteria, progress 100%, PO
        lengkap.
      </p>
      <TabAlert message={msg} />
      {items.length === 0 ? (
        <p className="text-muted">Belum ada kriteria.</p>
      ) : (
        <ul className="plain bast-list">
          {items.map((item) => (
            <li key={item.id} className="bast-row">
              <label className="bast-check">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) =>
                    setItems(
                      items.map((i) =>
                        i.id === item.id ? { ...i, done: e.target.checked } : i,
                      ),
                    )
                  }
                />
                <span>{item.label}</span>
              </label>
              <button
                type="button"
                className="danger-link"
                onClick={() => removeCriterion(item.id)}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
      {allDone && (
        <p className="text-muted" style={{ color: "var(--color-success-text)" }}>
          Semua kriteria terpenuhi — siap untuk gate closing.
        </p>
      )}
      <div className="form-row" style={{ marginTop: "1rem" }}>
        <label htmlFor="bast-new">Kriteria baru</label>
        <input
          id="bast-new"
          value={newLabel}
          placeholder="Contoh: BAST ditandatangani klien"
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCriterion();
            }
          }}
        />
      </div>
      <div className="btn-group">
        <button type="button" onClick={addCriterion}>
          Tambah kriteria
        </button>
        <button type="button" onClick={save}>
          Simpan checklist
        </button>
        <button
          type="button"
          className="primary"
          disabled={!canClose}
          onClick={closeProject}
          title={
            !canClose
              ? "Lengkapi checklist, progress 100%, dan proyek belum closed"
              : undefined
          }
        >
          Tutup proyek (Closed)
        </button>
      </div>
      {!canClose && !isClosed && (
        <p className="text-muted" style={{ marginTop: "0.75rem" }}>
          {progress < 100 && "Progress belum 100%. "}
          {!allDone && "Checklist BAST belum lengkap. "}
        </p>
      )}
    </div>
  );
}
