import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { normalizePredecessorLinkType } from "../../../predecessorLinkTypes";
import { formatProjectTimelineSummary, type ProjectTimelineSummary } from "../../../timelineProjectDuration";
import { newId } from "../../../lib/newId";
import type { TimelineEditorPredecessor, TimelineEditorRow, TimelineEditorSnapshot } from "./types";
import {
  TimelineEditorEmptyState,
  TimelineEditorKpi,
  rowDepthByParent,
} from "./timelineEditorUi";
import { TimelineEditorRowCard } from "./TimelineEditorRowCard";

function rowRef(row: TimelineEditorRow, index: number): string {
  return row.row_key?.trim() || String(row.id ?? `i_${index}`);
}

function lastRootPhaseRowRef(rows: TimelineEditorRow[]): string | null {
  const roots = rows.filter(
    (r) => !r.parent_ref && (r.item_type || "phase").toLowerCase() === "phase",
  );
  const last = roots[roots.length - 1];
  if (!last) return null;
  const idx = rows.indexOf(last);
  return rowRef(last, idx >= 0 ? idx : 0);
}

function defaultParentForNewRow(rows: TimelineEditorRow[]): string | null {
  const phases = rows.filter(
    (r) => (r.item_type || "phase").toLowerCase() === "phase" && !r.parent_ref,
  );
  const phase = phases[phases.length - 1] ?? phases[0];
  if (!phase) return null;
  const idx = rows.indexOf(phase);
  return rowRef(phase, idx >= 0 ? idx : 0);
}

function normalizeSortOrder(rows: TimelineEditorRow[]): TimelineEditorRow[] {
  return rows.map((r, i) => ({ ...r, sort_order: i }));
}

function mergePredecessorsFromPrev(
  prev: TimelineEditorRow[],
  fromApi: TimelineEditorRow[],
): TimelineEditorRow[] {
  const predByKey = new Map(
    prev.map((r, i) => [rowRef(r, i), r.predecessors ?? []] as const),
  );
  return fromApi.map((r, i) => ({
    ...r,
    predecessors:
      r.predecessors?.length ? r.predecessors : predByKey.get(rowRef(r, i)) ?? [],
  }));
}

export default function TimelineEditorSandbox({ projectId }: { projectId: number }) {
  const [startDate, setStartDate] = useState("");
  const [rows, setRows] = useState<TimelineEditorRow[]>([]);
  const [projectTimeline, setProjectTimeline] = useState<ProjectTimelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [error, setError] = useState("");
  const recalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await api<TimelineEditorSnapshot>(
        `/projects/${projectId}/timeline-editor/snapshot`,
      );
      setStartDate(snap.start_date?.slice(0, 10) ?? "");
      setRows(
        (snap.rows ?? []).map((r) => ({
          ...r,
          duration_days: r.duration_days ?? 1,
          weight_pct: r.weight_pct ?? 0,
          predecessors: r.predecessors?.length
            ? r.predecessors.map((p) => ({
                predecessor_ref: p.predecessor_ref,
                link_type: normalizePredecessorLinkType(p.link_type),
                lag_days: p.lag_days ?? 0,
              }))
            : [],
        })),
      );
      setProjectTimeline(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const scheduleRecalc = useCallback(
    (nextRows: TimelineEditorRow[], start: string) => {
      if (!start.trim()) return;
      if (recalcTimer.current) clearTimeout(recalcTimer.current);
      recalcTimer.current = setTimeout(() => {
        setRecalcBusy(true);
        setError("");
        api<{ rows: TimelineEditorRow[]; project_timeline?: ProjectTimelineSummary }>(
          `/projects/${projectId}/timeline-editor/recalc`,
          {
            method: "POST",
            body: JSON.stringify({
              start_date: start || null,
              rows: nextRows.map((r, idx) => ({
                ...r,
                row_key: rowRef(r, idx),
                sort_order: idx,
              })),
            }),
          },
        )
          .then((res) => {
            setRows((prev) =>
              mergePredecessorsFromPrev(
                prev,
                (res.rows ?? []).map((r) => ({
                  ...r,
                  duration_days: r.duration_days ?? 1,
                  predecessors: r.predecessors ?? [],
                })),
              ),
            );
            setProjectTimeline(res.project_timeline ?? null);
          })
          .catch((e) => setError(getErrorMessage(e)))
          .finally(() => setRecalcBusy(false));
      }, 450);
    },
    [projectId],
  );

  useEffect(
    () => () => {
      if (recalcTimer.current) clearTimeout(recalcTimer.current);
    },
    [],
  );

  const predOptions = useMemo(
    () =>
      rows.map((r, i) => ({
        ref: rowRef(r, i),
        label: r.name || rowRef(r, i),
        item_type: r.item_type,
      })),
    [rows],
  );

  const patchRow = (index: number, patch: Partial<TimelineEditorRow>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    setRows(next);
    scheduleRecalc(next, startDate);
  };

  const patchPredecessors = (index: number, preds: TimelineEditorPredecessor[]) => {
    patchRow(index, { predecessors: preds, schedule_driver: "duration" });
  };

  const addNewRow = () => {
    const parentRef = defaultParentForNewRow(rows);
    const isRootPhase = !parentRef;
    const chainPred = lastRootPhaseRowRef(rows);
    const predecessors: TimelineEditorPredecessor[] =
      isRootPhase && chainPred
        ? [{ predecessor_ref: chainPred, link_type: "FS", lag_days: 0 }]
        : [];
    const next = normalizeSortOrder([
      ...rows,
      {
        row_key: `te_${newId().slice(0, 8)}`,
        name: "Baru",
        duration_days: 1,
        weight_pct: 0,
        item_type: parentRef ? "task" : "phase",
        parent_ref: parentRef,
        sort_order: rows.length,
        predecessors,
        schedule_driver: "duration",
      },
    ]);
    setRows(next);
    if (!startDate.trim()) {
      setError("Isi tanggal mulai proyek agar tanggal baris baru dihitung otomatis.");
      return;
    }
    setError("");
    scheduleRecalc(next, startDate);
  };

  const removeRow = (index: number) => {
    const removedRef = rowRef(rows[index], index);
    const next = normalizeSortOrder(
      rows
        .filter((_, i) => i !== index)
        .map((r) => ({
          ...r,
          predecessors: (r.predecessors ?? []).filter((p) => p.predecessor_ref !== removedRef),
        })),
    );
    setRows(next);
    scheduleRecalc(next, startDate);
  };

  const durationLabel = formatProjectTimelineSummary(projectTimeline);

  if (loading) {
    return (
      <div className="timeline-editor">
        <div className="card timeline-editor__loading">
          <div className="timeline-editor__loading-bar" aria-hidden />
          <p>Memuat snapshot draft timeline…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-editor">
      <header className="card timeline-editor__hero">
        <div className="timeline-editor__hero-main">
          <div className="timeline-editor__intro">
            <h2 className="timeline-editor__title">
              Timeline Editor
              <span className="timeline-editor__badge">Beta</span>
            </h2>
            <p className="timeline-editor__subtitle">
              Sandbox terisolasi — salinan draft SPH untuk uji multi-predecessor, lag, dan cascade.
              Tab SPH dan Timeline live tidak diubah dari sini.
            </p>
          </div>
          <div className="timeline-editor__kpi-row">
            <TimelineEditorKpi label="Baris" value={rows.length} />
            <TimelineEditorKpi
              label="Durasi preview"
              value={durationLabel || "—"}
              sub={recalcBusy ? "Menghitung…" : startDate ? undefined : "Set tanggal mulai"}
            />
          </div>
        </div>

        <div className="timeline-editor__toolbar">
          <div className="timeline-editor__field">
            <label htmlFor="te-start">Tanggal mulai proyek</label>
            <input
              id="te-start"
              type="date"
              className="timeline-editor__input-date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                scheduleRecalc(rows, e.target.value);
              }}
            />
          </div>
          <div className="timeline-editor__toolbar-actions">
            <button type="button" className="primary" onClick={addNewRow}>
              + Tambah baris
            </button>
            <button type="button" onClick={() => void loadSnapshot()}>
              Muat ulang draft
            </button>
          </div>
        </div>

        {error ? (
          <div className="timeline-editor__alert timeline-editor__alert--error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="timeline-editor__notice sph-info-panel">
          <p>
            <strong>Aturan baris:</strong> tanpa parent → phase root; dengan parent → task.
            Phase root berurutan dapat predecessor <strong>FS</strong> otomatis. Kalender = hari
            kerja (Setting).
          </p>
        </div>
      </header>

      <section className="card timeline-editor__panel">
        <div className="timeline-editor__panel-head timeline-editor__panel-head--split">
          <div>
            <h3 className="ui-section__title">Grid jadwal</h3>
            <p className="ui-section__desc">
              {rows.length > 0
                ? `${rows.length} baris · recalc otomatis`
                : "Tambah baris atau muat dari draft SPH"}
            </p>
          </div>
          {rows.length > 0 ? (
            <button type="button" className="primary" onClick={addNewRow}>
              + Tambah baris
            </button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <TimelineEditorEmptyState onAdd={addNewRow} onReload={() => void loadSnapshot()} />
        ) : (
          <div className="timeline-editor-list">
            {rows.map((row, index) => {
              const selfRef = rowRef(row, index);
              const isMilestone = (row.item_type || "").toLowerCase() === "milestone";
              const itemType = (row.item_type || "task").toLowerCase();
              const depth = rowDepthByParent(row, rows, (r, i) =>
                rowRef(r as TimelineEditorRow, i),
              );
              const rowPredOptions = predOptions.filter((o) => o.ref !== selfRef);
              const parentOptions = predOptions.filter((o) => o.ref !== selfRef);
              return (
                <TimelineEditorRowCard
                  key={selfRef}
                  row={row}
                  depth={depth}
                  isMilestone={isMilestone}
                  itemType={itemType}
                  predOptions={rowPredOptions}
                  parentOptions={parentOptions}
                  onPatch={(patch) => patchRow(index, patch)}
                  onPatchPreds={(preds) => patchPredecessors(index, preds)}
                  onRemove={() => removeRow(index)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
