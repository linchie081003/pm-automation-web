import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { RebaselineDiffView, type RebaselineDiffPayload } from "../../../components/RebaselineDiffView";
import { normalizePredecessorLinkType, PREDECESSOR_LINK_OPTIONS } from "../../../predecessorLinkTypes";
import { phaseRowRef } from "../../../rebaselineSchedule";
import { useAuth } from "../../../auth";
import { formatDisplayDate, todayIsoDateInJakarta, toDateInputValue } from "../../../lib/formatDate";
import { formatClickUpSyncMessage, syncClickUpProgress } from "../../../clickupSync";
import type { ProjectDetail } from "../projectDetailTypes";
import { MilestonesLiveTimeline } from "../timeline/MilestonesLiveTimeline";
import type { MilestoneRow } from "../timeline/milestoneTypes";
import { TabAlert, TabFormFooter } from "../shared/TabLayout";
import { ProgressBar, WorkflowStatusBadge } from "../shared/milestoneDisplay";
import type { ProposedPhaseRow, RebaselinePhaseSummary } from "./milestones/rebaselineTypes";
import { rebaselineLifecycleLabel } from "./milestones/rebaselineTypes";
export function MilestonesTab({
  projectId,
  refreshKey,
  health,
  plannedStartDate,
  timelineStartEditable,
  structureEditable,
  progressEditable,
  deliveryStartedAt,
  currentPhase,
  onProjectRefresh,
}: {
  projectId: number;
  refreshKey: number;
  health: ProjectDetail["health"];
  plannedStartDate: string | null;
  timelineStartEditable: boolean;
  structureEditable: boolean;
  progressEditable: boolean;
  deliveryStartedAt: string | null;
  currentPhase: string;
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
  const [rebaseCategory, setRebaseCategory] = useState<"delay" | "scope_change">("delay");
  const [rebaseEffectiveFrom, setRebaseEffectiveFrom] = useState(() => todayIsoDateInJakarta());
  const [proposedPhases, setProposedPhases] = useState<ProposedPhaseRow[]>([]);
  const [rebasePreviewPayload, setRebasePreviewPayload] = useState<RebaselineDiffPayload | null>(
    null,
  );
  const [rebasePhaseSummary, setRebasePhaseSummary] = useState<RebaselinePhaseSummary | null>(null);
  const [rebaseClickUpNote, setRebaseClickUpNote] = useState("");
  const [rebaseMsg, setRebaseMsg] = useState("");
  const [rebaseBusy, setRebaseBusy] = useState(false);
  const behind =
    (health.actual_progress_pct ?? 0) < (health.planned_progress_pct ?? 0) - 0.01;
  const ragOk = health.rag_overall === "yellow" || health.rag_overall === "red";
  const delayEligible = behind && ragOk;
  const scopeEligible =
    !!deliveryStartedAt || currentPhase === "in_delivery" || currentPhase === "bast";
  const categoryEligible = rebaseCategory === "delay" ? delayEligible : scopeEligible;
  const rebaselineEnabled = rebaselineOptIn && categoryEligible;
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

  const scheduleAnomalyCount = useMemo(
    () => items.filter((m) => (m.schedule_anomalies?.length ?? 0) > 0).length,
    [items],
  );

  const seedProposedFromPreview = useCallback(
    (seed: Array<Record<string, unknown>>) => {
      setProposedPhases(
        seed.map((row, i) => ({
          name: String(row.name ?? ""),
          start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
          target_date: row.target_date ? String(row.target_date).slice(0, 10) : "",
          weight_pct: String(row.weight_pct ?? "0"),
          milestone_id: typeof row.milestone_id === "number" ? row.milestone_id : null,
          sort_order: typeof row.sort_order === "number" ? row.sort_order : i,
          lifecycle:
            row.lifecycle === "closed" ||
            row.lifecycle === "in_progress" ||
            row.lifecycle === "open"
              ? row.lifecycle
              : undefined,
          can_delete: row.can_delete !== false,
          can_edit_weight: row.can_edit_weight !== false,
          clickup_workflow: row.clickup_workflow ? String(row.clickup_workflow) : undefined,
          pdc_status: row.pdc_status ? String(row.pdc_status) : undefined,
          notes: row.notes ? String(row.notes) : "",
          predecessor_ref: row.predecessor_ref ? String(row.predecessor_ref) : "",
          predecessor_link_type: row.predecessor_link_type
            ? String(row.predecessor_link_type)
            : "FS",
          duration_days:
            typeof row.duration_days === "number" ? row.duration_days : undefined,
        })),
      );
    },
    [],
  );

  const proposedWeightTotal = useMemo(
    () =>
      proposedPhases.reduce((sum, p) => sum + (parseFloat(p.weight_pct) || 0), 0),
    [proposedPhases],
  );
  const weightTotalOk = Math.abs(proposedWeightTotal - 100) < 0.02;

  useEffect(() => {
    if (!rebaselineOptIn) return;
    setRebaseMsg("");
    api<{
      seed_from_live: Array<Record<string, unknown>>;
      phase_summary: RebaselinePhaseSummary;
      clickup_note?: string;
      eligibility: { delay: boolean; scope_change: boolean };
    }>(`/projects/${projectId}/rebaseline/preview`)
      .then((data) => {
        seedProposedFromPreview(data.seed_from_live);
        setRebasePhaseSummary(data.phase_summary ?? null);
        setRebaseClickUpNote(data.clickup_note ?? "");
        if (rebaseCategory === "delay" && !data.eligibility.delay && data.eligibility.scope_change) {
          setRebaseCategory("scope_change");
        }
      })
      .catch((e) => setRebaseMsg(getErrorMessage(e)));
  }, [rebaselineOptIn, projectId, refreshKey, seedProposedFromPreview]);

  const proposedPhasesBody = (rows: ProposedPhaseRow[] = proposedPhases) =>
    rows.map((p) => ({
      name: p.name,
      start_date: p.start_date || null,
      target_date: p.target_date || null,
      weight_pct: parseFloat(p.weight_pct) || 0,
      milestone_id: p.milestone_id ?? null,
      client_key: p.client_key ?? null,
      sort_order: p.sort_order,
      notes: p.notes?.trim() || null,
      predecessor_ref: p.predecessor_ref?.trim() || null,
      predecessor_link_type: p.predecessor_ref?.trim()
        ? normalizePredecessorLinkType(p.predecessor_link_type)
        : null,
      duration_days: p.duration_days ?? null,
    }));

  const mergeRecalcProposedPhases = (
    prev: ProposedPhaseRow[],
    apiRows: Array<Record<string, unknown>>,
  ): ProposedPhaseRow[] =>
    (apiRows ?? []).map((row, i) => ({
      name: String(row.name ?? ""),
      start_date: row.start_date ? String(row.start_date).slice(0, 10) : "",
      target_date: row.target_date ? String(row.target_date).slice(0, 10) : "",
      weight_pct: String(row.weight_pct ?? "0"),
      milestone_id: typeof row.milestone_id === "number" ? row.milestone_id : null,
      client_key: row.client_key ? String(row.client_key) : undefined,
      sort_order: typeof row.sort_order === "number" ? row.sort_order : i,
      notes: prev[i]?.notes ?? "",
      predecessor_ref: prev[i]?.predecessor_ref ?? (row.predecessor_ref ? String(row.predecessor_ref) : ""),
      predecessor_link_type:
        prev[i]?.predecessor_link_type ??
        (row.predecessor_link_type ? String(row.predecessor_link_type) : "FS"),
      duration_days:
        typeof row.duration_days === "number" ? row.duration_days : prev[i]?.duration_days,
      lifecycle: prev.find((p) => p.milestone_id === row.milestone_id)?.lifecycle ?? prev[i]?.lifecycle,
      can_delete: prev[i]?.can_delete,
      can_edit_weight: prev[i]?.can_edit_weight,
      clickup_workflow: prev[i]?.clickup_workflow,
      pdc_status: prev[i]?.pdc_status,
    }));

  const runRebaseRecalcDates = async (rows: ProposedPhaseRow[] = proposedPhases) => {
    setRebaseBusy(true);
    setRebaseMsg("");
    try {
      const res = await api<{ proposed_phases: Array<Record<string, unknown>> }>(
        `/projects/${projectId}/rebaseline/recalc-dates`,
        {
          method: "POST",
          body: JSON.stringify({
            effective_from: rebaseEffectiveFrom,
            proposed_phases: proposedPhasesBody(rows),
          }),
        },
      );
      setProposedPhases(mergeRecalcProposedPhases(rows, res.proposed_phases ?? []));
    } catch (e) {
      setRebaseMsg(getErrorMessage(e));
    } finally {
      setRebaseBusy(false);
    }
  };

  const rebaseRecalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRebaseRecalcDates = (rows: ProposedPhaseRow[]) => {
    if (rebaseRecalcTimer.current) clearTimeout(rebaseRecalcTimer.current);
    rebaseRecalcTimer.current = setTimeout(() => {
      void runRebaseRecalcDates(rows);
    }, 450);
  };

  useEffect(() => {
    if (!rebaselineEnabled || proposedPhases.length === 0) return;
    scheduleRebaseRecalcDates(proposedPhases);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalc when effective date changes
  }, [rebaseEffectiveFrom]);

  const runRebaseValidate = async () => {
    setRebaseBusy(true);
    setRebaseMsg("");
    try {
      const payload = await api<RebaselineDiffPayload>(`/projects/${projectId}/rebaseline/validate`, {
        method: "POST",
        body: JSON.stringify({
          category: rebaseCategory,
          effective_from: rebaseEffectiveFrom,
          proposed_phases: proposedPhasesBody(),
        }),
      });
      setRebasePreviewPayload(payload);
    } catch (e) {
      setRebasePreviewPayload(null);
      setRebaseMsg(getErrorMessage(e));
    } finally {
      setRebaseBusy(false);
    }
  };

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
          <TabFormFooter>
            <button
              type="button"
              className="primary"
              disabled={startBusy}
              onClick={() => void saveProjectStart()}
            >
              {startBusy ? "Menyimpan…" : "Simpan tanggal start proyek"}
            </button>
          </TabFormFooter>
        </div>
      )}
      <TabAlert message={err} variant="error" />
      <TabAlert message={syncMsg} />
      {scheduleAnomalyCount > 0 && (
        <TabAlert
          variant="error"
          message={`Red flag jadwal: ${scheduleAnomalyCount} baris parent/anak tidak konsisten (mulai anak sebelum parent atau target anak melewati parent). Periksa kolom tanggal bertanda ⚠.`}
        />
      )}
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
        <MilestonesLiveTimeline
          projectId={projectId}
          items={items}
          canWriteStructure={canWriteStructure}
          onReload={load}
          onRemove={removeMilestone}
          renderLiveMeta={(m, row) => {
            const scheduleAnomalyTip =
              (m.schedule_anomalies?.length ?? 0) > 0
                ? m.schedule_anomalies!.join("\n")
                : undefined;
            return (
              <div className="te-live-meta-grid">
                <div>
                  <span className="te-live-meta-label">Modul</span>
                  {m.module?.trim() ? m.module : "—"}
                </div>
                <div>
                  <span className="te-live-meta-label">Progress</span>
                  <ProgressBar pct={m.clickup_progress_pct} />
                </div>
                <div>
                  <span className="te-live-meta-label">Status</span>
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
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <span className="te-live-meta-label">Due ClickUp</span>
                  {formatDisplayDate(m.clickup_due_date)}
                </div>
                <div>
                  <span className="te-live-meta-label">Termin</span>
                  {canWriteStructure && !m.clickup_only && m.id > 0 ? (
                    <label>
                      <input
                        type="checkbox"
                        checked={!!m.is_payment_milestone}
                        onChange={() => togglePaymentMilestone(m)}
                      />{" "}
                      Milestone bayar
                    </label>
                  ) : m.is_payment_milestone ? (
                    "Ya"
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  {canWriteStructure && !m.clickup_only && m.id > 0 && !row.live?.evm_locked ? (
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() => removeMilestone(m.id, m.name)}
                    >
                      Hapus
                    </button>
                  ) : null}
                </div>
                {scheduleAnomalyTip ? (
                  <div className="te-live-meta-anomaly" title={scheduleAnomalyTip}>
                    ⚠ {scheduleAnomalyTip}
                  </div>
                ) : null}
                {m.clickup_only ? (
                  <span className="timeline-gantt-pro__cu-tag">ClickUp only</span>
                ) : null}
              </div>
            );
          }}
        />
      )}
      <div style={{ marginTop: "1.5rem" }} className="card">
        <h3 className="card-title">Rebaseline schedule</h3>
        <p className="text-muted">
          Usulan jadwal disimpan di pengajuan; milestone live baru berubah setelah disetujui.
          Keterlambatan: actual di bawah target + RAG kuning/merah. Perubahan scope: tersedia saat
          delivery.
        </p>
        <label className="rebaseline-toggle">
          <input
            type="checkbox"
            checked={rebaselineOptIn}
            onChange={(e) => setRebaselineOptIn(e.target.checked)}
            disabled={!delayEligible && !scopeEligible}
          />{" "}
          Enable rebaseline schedule
        </label>
        {!delayEligible && !scopeEligible && (
          <p className="text-muted">Rebaseline belum memenuhi syarat untuk kondisi proyek saat ini.</p>
        )}
        {rebaselineOptIn && (
          <>
            <div className="form-row" style={{ marginTop: "0.75rem" }}>
              <span>Kategori alasan</span>
              <label>
                <input
                  type="radio"
                  name="rebase-cat"
                  checked={rebaseCategory === "delay"}
                  disabled={!delayEligible}
                  onChange={() => setRebaseCategory("delay")}
                />{" "}
                Keterlambatan
              </label>
              <label>
                <input
                  type="radio"
                  name="rebase-cat"
                  checked={rebaseCategory === "scope_change"}
                  disabled={!scopeEligible}
                  onChange={() => setRebaseCategory("scope_change")}
                />{" "}
                Perubahan scope
              </label>
            </div>
            <div className="form-row" style={{ maxWidth: "16rem" }}>
              <label htmlFor="rebase-eff">Effective from</label>
              <input
                id="rebase-eff"
                type="date"
                value={rebaseEffectiveFrom}
                onChange={(e) => setRebaseEffectiveFrom(e.target.value)}
              />
            </div>
          </>
        )}
        {rebaselineEnabled && (
          <>
            {rebasePhaseSummary && (
              <div className="sph-info-panel" style={{ marginBottom: "0.75rem" }}>
                <p className="text-muted" style={{ marginTop: 0 }}>
                  <strong>Status fase (live + ClickUp):</strong> Open{" "}
                  {rebasePhaseSummary.open_phase_ids.length}, In progress{" "}
                  {rebasePhaseSummary.in_progress_phase_ids.length}, Closed{" "}
                  {rebasePhaseSummary.closed_phase_ids.length}. Hapus hanya untuk fase Open.
                  Bobot fase Closed (done) terkunci.
                </p>
                {rebaseCategory === "scope_change" &&
                  rebasePhaseSummary.adjustable_weights.length > 0 && (
                    <p className="text-muted">
                      Bobot dapat disesuaikan (ambil dari):{" "}
                      {rebasePhaseSummary.adjustable_weights
                        .filter((a) => a.lifecycle !== "closed")
                        .map((a) => `${a.name} (${a.weight_pct}%)`)
                        .join(", ") || "—"}
                    </p>
                  )}
              </div>
            )}
            {rebaseClickUpNote && (
              <div className="sph-info-panel" style={{ marginBottom: "0.75rem" }}>
                <p className="text-muted" style={{ marginTop: 0 }}>
                  {rebaseClickUpNote}
                </p>
                <button
                  type="button"
                  disabled={syncBusy}
                  onClick={() => void syncFromClickUp()}
                >
                  {syncBusy ? "Sync…" : "Sync ClickUp sekarang"}
                </button>
              </div>
            )}
            {rebaseCategory === "scope_change" && (
              <p className="text-muted">
                Perubahan scope wajib menambahkan minimal satu fase baru; kurangi bobot fase open
                agar total tetap 100%.
              </p>
            )}
            <h4 className="subsection-title">Usulan fase (phase)</h4>
            <p className="text-muted">
              <strong>Predecessor:</strong> pilih fase lalu tipe relasi{" "}
              <strong>FS / SS / FF / SF</strong> (MS Project). FS = mulai setelah selesai; SS =
              mulai bersamaan; FF = selesai bersamaan; SF = selesai saat predecessor mulai. Kosong
              = rantai urutan otomatis.
            </p>
            <div className="btn-group" style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                disabled={rebaseBusy}
                onClick={() => void runRebaseRecalcDates()}
              >
                Hitung ulang tanggal (predecessor)
              </button>
            </div>
            <table className="compact-table rebaseline-proposal-table">
              <colgroup>
                <col className="col-status" />
                <col />
                <col className="col-pred" />
                <col className="col-pred-type" />
                <col className="col-date" />
                <col className="col-date" />
                <col className="col-weight" />
                {rebaseCategory === "scope_change" && <col className="col-action" />}
                <col className="col-notes" />
              </colgroup>
              <thead>
                <tr>
                  <th className="col-status">Status</th>
                  <th className="col-name">Nama fase</th>
                  <th className="col-pred">Predecessor</th>
                  <th className="col-pred-type">Relasi</th>
                  <th className="col-date">Start</th>
                  <th className="col-date">Target</th>
                  <th className="num col-weight">Bobot %</th>
                  {rebaseCategory === "scope_change" && <th className="col-action">Aksi</th>}
                  <th className="col-notes">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {proposedPhases.map((row, idx) => {
                  const deleteLocked =
                    row.milestone_id != null && row.can_delete === false;
                  const weightLocked =
                    rebaseCategory === "delay" ||
                    (row.milestone_id != null && row.can_edit_weight === false);
                  const datesLocked = row.lifecycle === "closed";
                  const rowRef = phaseRowRef(row, idx);
                  const predOptions = proposedPhases
                    .map((p, j) => ({ p, j, ref: phaseRowRef(p, j) }))
                    .filter((o) => o.ref !== rowRef);
                  return (
                  <tr key={row.milestone_id ?? row.client_key ?? idx}>
                    <td>
                      <span
                        className={`phase-status phase-status--${(row.lifecycle ?? "open").replace(/_/g, "-")}`}
                        title={row.clickup_workflow ?? undefined}
                      >
                        {rebaselineLifecycleLabel(row)}
                      </span>
                    </td>
                    <td className="col-name">
                      <input
                        value={row.name}
                        disabled={rebaseCategory === "delay"}
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          next[idx] = { ...row, name: e.target.value };
                          setProposedPhases(next);
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={row.predecessor_ref ?? ""}
                        disabled={datesLocked}
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          const val = e.target.value || undefined;
                          next[idx] = {
                            ...row,
                            predecessor_ref: val,
                            predecessor_link_type: val
                              ? normalizePredecessorLinkType(row.predecessor_link_type)
                              : undefined,
                          };
                          setProposedPhases(next);
                          scheduleRebaseRecalcDates(next);
                        }}
                      >
                        <option value="">— (rantai urutan)</option>
                        {predOptions.map(({ p, ref }) => (
                          <option key={ref} value={ref}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="col-pred-type">
                      <select
                        value={normalizePredecessorLinkType(row.predecessor_link_type)}
                        disabled={datesLocked || !row.predecessor_ref}
                        title={
                          PREDECESSOR_LINK_OPTIONS.find(
                            (o) => o.value === normalizePredecessorLinkType(row.predecessor_link_type),
                          )?.hint
                        }
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          next[idx] = {
                            ...row,
                            predecessor_link_type: e.target.value,
                          };
                          setProposedPhases(next);
                          scheduleRebaseRecalcDates(next);
                        }}
                      >
                        {PREDECESSOR_LINK_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.value}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={row.start_date}
                        disabled={datesLocked}
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          next[idx] = { ...row, start_date: e.target.value };
                          setProposedPhases(next);
                          scheduleRebaseRecalcDates(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={row.target_date}
                        disabled={datesLocked}
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          next[idx] = { ...row, target_date: e.target.value };
                          setProposedPhases(next);
                          scheduleRebaseRecalcDates(next);
                        }}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        step="0.01"
                        value={row.weight_pct}
                        disabled={weightLocked}
                        title={
                          weightLocked
                            ? "Bobot terkunci untuk kategori keterlambatan atau fase selesai"
                            : undefined
                        }
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          next[idx] = { ...row, weight_pct: e.target.value };
                          setProposedPhases(next);
                        }}
                      />
                    </td>
                    {rebaseCategory === "scope_change" && (
                      <td>
                        <button
                          type="button"
                          disabled={deleteLocked}
                          title={
                            deleteLocked
                              ? "Fase done / in progress / closed tidak boleh dihapus"
                              : undefined
                          }
                          onClick={() =>
                            setProposedPhases(proposedPhases.filter((_, i) => i !== idx))
                          }
                        >
                          Hapus
                        </button>
                      </td>
                    )}
                    <td className="col-notes">
                      <input
                        type="text"
                        placeholder="Catatan PM…"
                        value={row.notes ?? ""}
                        onChange={(e) => {
                          const next = [...proposedPhases];
                          next[idx] = { ...row, notes: e.target.value };
                          setProposedPhases(next);
                        }}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={weightTotalOk ? "text-muted" : "error"} style={{ marginTop: "0.5rem" }}>
              Total bobot usulan: <strong>{proposedWeightTotal.toFixed(2)}%</strong> / 100%
              {!weightTotalOk && " — sesuaikan bobot fase open sebelum ajuan."}
            </p>
            {rebaseCategory === "scope_change" && (
              <button
                type="button"
                style={{ marginTop: "0.5rem" }}
                onClick={() => {
                  const next = [
                    ...proposedPhases,
                    {
                      name: "Fase baru",
                      start_date: "",
                      target_date: "",
                      weight_pct: "0",
                      client_key: `new-${Date.now()}`,
                      sort_order: proposedPhases.length,
                      can_delete: true,
                      can_edit_weight: true,
                    },
                  ];
                  setProposedPhases(next);
                  scheduleRebaseRecalcDates(next);
                }}
              >
                Tambah fase
              </button>
            )}
            <div className="btn-group" style={{ marginTop: "0.75rem" }}>
              <button type="button" disabled={rebaseBusy} onClick={() => void runRebaseValidate()}>
                Pratinjau diff
              </button>
            </div>
            {rebasePreviewPayload && <RebaselineDiffView payload={rebasePreviewPayload} />}
            {rebaseMsg && <p className="error">{rebaseMsg}</p>}
            <textarea
              placeholder="Alasan rebaseline"
              value={rebaseReason}
              onChange={(e) => setRebaseReason(e.target.value)}
            />
            <div className="btn-group">
              <button
                type="button"
                className="primary"
                disabled={rebaseBusy || !rebaseReason.trim() || !weightTotalOk}
                onClick={async () => {
                  setRebaseBusy(true);
                  setRebaseMsg("");
                  try {
                    const res = await api<{ id: number }>(
                      `/projects/${projectId}/rebaseline/request`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          reason: rebaseReason,
                          category: rebaseCategory,
                          effective_from: rebaseEffectiveFrom,
                          proposed_phases: proposedPhasesBody(),
                        }),
                      },
                    );
                    setReqId(res.id);
                    setRebaseMsg("Pengajuan rebaseline tersimpan.");
                  } catch (e) {
                    setRebaseMsg(getErrorMessage(e));
                  } finally {
                    setRebaseBusy(false);
                  }
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
                  setRebaseMsg("Kesepakatan klien ditandai.");
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

