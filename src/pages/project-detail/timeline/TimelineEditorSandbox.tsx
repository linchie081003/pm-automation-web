import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { normalizePredecessorLinkType } from "../../../predecessorLinkTypes";
import { formatProjectTimelineSummary, type ProjectTimelineSummary } from "../../../timelineProjectDuration";
import { newId } from "../../../lib/newId";
import {
  formatDraftWeightErrors,
  validateDraftTimelineWeight,
  type DraftWeightRow,
} from "../../../lib/timelineWeightValidation";
import type { TimelineEditorPredecessor, TimelineEditorRow, TimelineEditorSnapshot } from "./types";
import {
  TimelineEditorEmptyState,
  TimelineEditorKpi,
  rowDepthByParent,
} from "./timelineEditorUi";
import { TimelineEditorTable } from "./TimelineEditorTable";
import { TimelineEditorGanttPreview } from "./TimelineEditorGanttPreview";
import {
  collapseAllParentRefs,
  expandAllCollapsed,
  parentRefsWithChildren,
  toggleCollapsedRef,
  visibleTimelineEditorIndices,
} from "./timelineEditorCollapse";

function rowRef(row: TimelineEditorRow, index: number): string {
  return row.row_key?.trim() || String(row.id ?? `i_${index}`);
}

function isRootPhaseRow(row: TimelineEditorRow): boolean {
  return (
    !row.parent_ref && (row.item_type || "phase").toLowerCase() === "phase"
  );
}

function previousRootPhaseRef(rows: TimelineEditorRow[], beforeIndex: number): string | null {
  for (let j = beforeIndex - 1; j >= 0; j--) {
    if (isRootPhaseRow(rows[j])) {
      return rowRef(rows[j], j);
    }
  }
  return null;
}

function rootPhaseIndexForRow(rows: TimelineEditorRow[], rowIndex: number): number {
  if (isRootPhaseRow(rows[rowIndex])) return rowIndex;
  let cur = rows[rowIndex]?.parent_ref?.trim() || "";
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const idx = rows.findIndex((r, i) => rowRef(r, i) === cur);
    if (idx < 0) break;
    if (isRootPhaseRow(rows[idx])) return idx;
    cur = rows[idx].parent_ref?.trim() || "";
  }
  return rowIndex;
}

/** Index after the last row belonging to the same root phase block as `rowIndex`. */
function phaseBlockEndIndex(rows: TimelineEditorRow[], rowIndex: number): number {
  const rootIdx = rootPhaseIndexForRow(rows, rowIndex);
  if (!isRootPhaseRow(rows[rootIdx])) {
    return Math.min(rowIndex + 1, rows.length);
  }
  const rootKey = rowRef(rows[rootIdx], rootIdx);
  let end = rootIdx + 1;
  while (end < rows.length) {
    const cur = rows[end];
    if (isRootPhaseRow(cur)) break;
    let p = cur.parent_ref?.trim() || "";
    let underRoot = false;
    const seen = new Set<string>();
    while (p && !seen.has(p)) {
      seen.add(p);
      if (p === rootKey) {
        underRoot = true;
        break;
      }
      const pi = rows.findIndex((r, i) => rowRef(r, i) === p);
      if (pi < 0) break;
      p = rows[pi].parent_ref?.trim() || "";
    }
    if (underRoot) {
      end += 1;
      continue;
    }
    break;
  }
  return end;
}

function editorRowsForWeightCheck(rows: TimelineEditorRow[]): DraftWeightRow[] {
  const idToKey: Record<number, string> = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.id != null && r.row_key) idToKey[r.id] = r.row_key;
  }
  return rows.map((r, idx) => ({
    id: r.id ?? undefined,
    row_key: r.row_key || rowRef(r, idx),
    name: r.name,
    weight_pct: (r.item_type || "").toLowerCase() === "milestone" ? 0 : r.weight_pct ?? 0,
    item_type: r.item_type || "phase",
    parent_ref:
      r.parent_ref ?? (r.parent_id != null ? idToKey[r.parent_id] ?? null : null),
  }));
}

function defaultChildWeight(rows: TimelineEditorRow[], parentRef: string | null): number {
  if (!parentRef) return 0;
  const parentIdx = rows.findIndex((r, i) => rowRef(r, i) === parentRef);
  if (parentIdx < 0) return 0;
  const parent = rows[parentIdx];
  if ((parent.item_type || "").toLowerCase() === "milestone") return 0;
  const parentWeight = Number(parent.weight_pct) || 0;
  let siblingSum = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.parent_ref !== parentRef) continue;
    if ((r.item_type || "").toLowerCase() === "milestone") continue;
    siblingSum += Number(r.weight_pct) || 0;
  }
  const remainder = Math.max(0, parentWeight - siblingSum);
  return remainder > 0 ? remainder : 0;
}

function buildRootPhaseRow(rows: TimelineEditorRow[], insertAt: number): TimelineEditorRow {
  const pred = previousRootPhaseRef(rows, insertAt);
  return {
    row_key: `te_${newId().slice(0, 8)}`,
    name: "Fase baru",
    duration_days: 1,
    weight_pct: 0,
    item_type: "phase",
    parent_ref: null,
    sort_order: insertAt,
    predecessors: pred
      ? [{ predecessor_ref: pred, link_type: "FS", lag_days: 0 }]
      : [],
    schedule_driver: "duration",
  };
}

/** Task / subtask / dalam fase — bukan phase root antar-fase. */
function buildNewRowAt(rows: TimelineEditorRow[], insertAt: number): TimelineEditorRow {
  const rowBefore = insertAt > 0 ? rows[insertAt - 1] : null;
  const rowAt = insertAt < rows.length ? rows[insertAt] : null;

  if (rowAt && isRootPhaseRow(rowAt)) {
    return buildRootPhaseRow(rows, insertAt);
  }

  let parent_ref: string | null = null;
  let item_type = "phase";
  let predecessors: TimelineEditorPredecessor[] = [];

  if (rowBefore) {
    const t = (rowBefore.item_type || "phase").toLowerCase();
    const beforeIdx = insertAt - 1;
    if (t === "phase" && !rowBefore.parent_ref) {
      parent_ref = rowRef(rowBefore, beforeIdx);
      item_type = "task";
    } else if (rowBefore.parent_ref) {
      parent_ref = rowBefore.parent_ref;
      item_type = t === "subtask" ? "subtask" : "task";
    } else if (t === "phase") {
      item_type = "phase";
    }
  } else if (rowAt?.parent_ref) {
    parent_ref = rowAt.parent_ref;
    item_type = "task";
  }

  if (!parent_ref && item_type === "phase" && insertAt > 0) {
    const pred = previousRootPhaseRef(rows, insertAt);
    if (pred) {
      predecessors = [{ predecessor_ref: pred, link_type: "FS", lag_days: 0 }];
    }
  }

  const weight_pct =
    parent_ref && item_type !== "milestone"
      ? defaultChildWeight(rows, parent_ref)
      : 0;

  return {
    row_key: `te_${newId().slice(0, 8)}`,
    name: "Baru",
    duration_days: 1,
    weight_pct,
    item_type,
    parent_ref,
    sort_order: insertAt,
    predecessors,
    schedule_driver: "duration",
  };
}

function normalizeSortOrder(rows: TimelineEditorRow[]): TimelineEditorRow[] {
  return rows.map((r, i) => ({ ...r, sort_order: i }));
}

function sortTimelineEditorRows(rows: TimelineEditorRow[]): TimelineEditorRow[] {
  return normalizeSortOrder(
    [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  );
}

function mapSnapshotRows(raw: TimelineEditorRow[]): TimelineEditorRow[] {
  return sortTimelineEditorRows(
    raw.map((r) => ({
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
}

function moveTimelineRow(
  rows: TimelineEditorRow[],
  index: number,
  direction: -1 | 1,
): TimelineEditorRow[] {
  const j = index + direction;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[j]] = [next[j], next[index]];
  return normalizeSortOrder(next);
}

function prepareRowsForRecalc(rows: TimelineEditorRow[]): TimelineEditorRow[] {
  return rows.map((r, idx) => ({
    ...r,
    row_key: rowRef(r, idx),
    sort_order: idx,
  }));
}

/** Preserve editable fields from the payload that was sent with this recalc request. */
function mergeRecalcResponse(
  sentRows: TimelineEditorRow[],
  fromApi: TimelineEditorRow[],
): TimelineEditorRow[] {
  const apiByKey = new Map(fromApi.map((r, i) => [rowRef(r, i), r] as const));
  return normalizeSortOrder(
    sentRows.map((sent, i) => {
      const key = rowRef(sent, i);
      const r = apiByKey.get(key);
      const predecessors =
        sent.predecessors?.length
          ? sent.predecessors
          : r?.predecessors?.length
            ? r.predecessors
            : [];
      if (!r) {
        return { ...sent, sort_order: i, predecessors };
      }
      return {
        ...r,
        sort_order: i,
        name: sent.name,
        parent_ref: sent.parent_ref,
        item_type: sent.item_type,
        weight_pct: sent.weight_pct ?? 0,
        schedule_driver: sent.schedule_driver,
        duration_days: r.duration_days ?? sent.duration_days ?? 1,
        predecessors,
      };
    }),
  );
}

export default function TimelineEditorSandbox({ projectId }: { projectId: number }) {
  const [startDate, setStartDate] = useState("");
  const [rows, setRows] = useState<TimelineEditorRow[]>([]);
  const [projectTimeline, setProjectTimeline] = useState<ProjectTimelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [storageSource, setStorageSource] = useState<string>("empty");
  const [sphDraftWritable, setSphDraftWritable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [collapsedRefs, setCollapsedRefs] = useState<Set<string>>(() => new Set());
  const recalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recalcGeneration = useRef(0);
  const recalcAbort = useRef<AbortController | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await api<TimelineEditorSnapshot>(
        `/projects/${projectId}/timeline-editor/snapshot`,
      );
      setStartDate(snap.start_date?.slice(0, 10) ?? "");
      setRows(mapSnapshotRows(snap.rows ?? []));
      setProjectTimeline(null);
      setSaveMsg("");
      setStorageSource(snap.storage_source ?? snap.read_only_source ?? "empty");
      setSphDraftWritable(
        typeof snap.sph_draft_writable === "boolean" ? snap.sph_draft_writable : null,
      );
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
      const generation = ++recalcGeneration.current;
      const rowsPayload = prepareRowsForRecalc(nextRows);
      recalcTimer.current = setTimeout(() => {
        recalcAbort.current?.abort();
        const ac = new AbortController();
        recalcAbort.current = ac;
        setRecalcBusy(true);
        setError("");
        void api<{ rows: TimelineEditorRow[]; project_timeline?: ProjectTimelineSummary }>(
          `/projects/${projectId}/timeline-editor/recalc`,
          {
            method: "POST",
            signal: ac.signal,
            body: JSON.stringify({
              start_date: start || null,
              rows: rowsPayload,
            }),
          },
        )
          .then((res) => {
            if (generation !== recalcGeneration.current) return;
            setRows(
              mergeRecalcResponse(
                rowsPayload,
                (res.rows ?? []).map((r) => ({
                  ...r,
                  duration_days: r.duration_days ?? 1,
                  predecessors: r.predecessors ?? [],
                })),
              ),
            );
            setProjectTimeline(res.project_timeline ?? null);
          })
          .catch((e) => {
            if (ac.signal.aborted) return;
            if (generation !== recalcGeneration.current) return;
            setError(getErrorMessage(e));
          })
          .finally(() => {
            if (generation === recalcGeneration.current) setRecalcBusy(false);
          });
      }, 450);
    },
    [projectId],
  );

  useEffect(() => {
    if (loading || !startDate.trim() || rows.length === 0) return;
    scheduleRecalc(rows, startDate);
    // Hitung ulang tanggal setelah snapshot / muat ulang agar preview Gantt terisi
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya saat loading selesai
  }, [loading]);

  useEffect(
    () => () => {
      if (recalcTimer.current) clearTimeout(recalcTimer.current);
      recalcAbort.current?.abort();
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

  const weightCheck = useMemo(
    () => validateDraftTimelineWeight(editorRowsForWeightCheck(rows)),
    [rows],
  );

  const parentChildRefs = useMemo(() => parentRefsWithChildren(rows), [rows]);

  const visibleIndices = useMemo(
    () => visibleTimelineEditorIndices(rows, rowRef, collapsedRefs),
    [rows, collapsedRefs],
  );

  const toggleTreeCollapse = useCallback((ref: string) => {
    setCollapsedRefs((prev) => toggleCollapsedRef(prev, ref));
  }, []);

  const patchRow = (index: number, patch: Partial<TimelineEditorRow>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    setRows(next);
    scheduleRecalc(next, startDate);
  };

  const patchPredecessors = (index: number, preds: TimelineEditorPredecessor[]) => {
    patchRow(index, { predecessors: preds, schedule_driver: "duration" });
  };

  const insertRowAt = (insertAt: number, row: TimelineEditorRow) => {
    const at = Math.max(0, Math.min(insertAt, rows.length));
    const next = normalizeSortOrder([...rows.slice(0, at), row, ...rows.slice(at)]);
    setRows(next);
    if (!startDate.trim()) {
      setError("Isi tanggal mulai proyek agar tanggal baris baru dihitung otomatis.");
      return;
    }
    setError("");
    scheduleRecalc(next, startDate);
  };

  const addRowAt = (insertAt: number) => {
    insertRowAt(insertAt, buildNewRowAt(rows, insertAt));
  };

  const addRootPhaseAt = (insertAt: number) => {
    insertRowAt(insertAt, buildRootPhaseRow(rows, insertAt));
  };

  /** Sisip phase root setelah blok fase baris ini (antara fase). */
  const addRootPhaseAfterBlock = (rowIndex: number) => {
    addRootPhaseAt(phaseBlockEndIndex(rows, rowIndex));
  };

  const addPhaseAtStart = () => addRootPhaseAt(0);
  const addRowAtEnd = () => addRowAt(rows.length);

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

  const moveRow = (index: number, direction: -1 | 1) => {
    const next = moveTimelineRow(rows, index, direction);
    if (next === rows) return;
    setRows(next);
    scheduleRecalc(next, startDate);
  };

  const applySnapshot = useCallback((snap: TimelineEditorSnapshot) => {
    setStartDate(snap.start_date?.slice(0, 10) ?? "");
    setRows(mapSnapshotRows(snap.rows ?? []));
    setStorageSource(snap.storage_source ?? snap.read_only_source ?? "empty");
    setSphDraftWritable(
      typeof snap.sph_draft_writable === "boolean" ? snap.sph_draft_writable : null,
    );
  }, []);

  const saveToDraft = async () => {
    if (!startDate.trim()) {
      setError("Isi tanggal mulai proyek sebelum simpan.");
      return;
    }
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(editorRowsForWeightCheck(rows)),
    );
    if (weightErr) {
      setError(weightErr.replace(/^\[Data tidak valid\]\s*/, ""));
      return;
    }
    setSaveBusy(true);
    setError("");
    setSaveMsg("");
    recalcGeneration.current += 1;
    if (recalcTimer.current) clearTimeout(recalcTimer.current);
    recalcAbort.current?.abort();
    try {
      const rowsPayload = prepareRowsForRecalc(rows);
      const snap = await api<
        TimelineEditorSnapshot & { project_timeline?: ProjectTimelineSummary }
      >(`/projects/${projectId}/timeline-editor/save`, {
        method: "PUT",
        body: JSON.stringify({
          start_date: startDate || null,
          rows: rowsPayload,
        }),
      });
      applySnapshot(snap);
      setProjectTimeline(snap.project_timeline ?? null);
      setSaveMsg("Tersimpan ke workspace Timeline Editor (beta) — terpisah dari draft SPH.");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaveBusy(false);
    }
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
            <TimelineEditorKpi
              label="Bobot phase root"
              value={rows.length ? `${weightCheck.rootTotal.toFixed(1)}%` : "—"}
              sub={weightCheck.ok ? "Valid (±0,5%)" : "Perlu perbaikan"}
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
            <button type="button" onClick={addPhaseAtStart}>
              + Fase di awal
            </button>
            <button type="button" className="primary" onClick={addRowAtEnd}>
              + Tambah baris
            </button>
            <button
              type="button"
              className="primary timeline-editor__btn-save"
              disabled={saveBusy || rows.length === 0}
              onClick={() => void saveToDraft()}
            >
              {saveBusy ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={() => void loadSnapshot()}>
              Muat ulang draft
            </button>
          </div>
        </div>

        {saveMsg ? (
          <div className="timeline-editor__alert timeline-editor__alert--ok" role="status">
            {saveMsg}
          </div>
        ) : null}

        {storageSource === "draft_seed" ? (
          <div className="timeline-editor__alert timeline-editor__alert--warn" role="status">
            Tampilan dari salinan draft SPH — belum tersimpan di workspace beta. Klik{" "}
            <strong>Simpan</strong> untuk menulis ke tabel editor.
            {sphDraftWritable === false
              ? " Draft SPH tetap read-only; perubahan di sini tidak mengubah SPH sampai fitur apply."
              : null}
          </div>
        ) : null}

        {error ? (
          <div className="timeline-editor__alert timeline-editor__alert--error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="timeline-editor__notice sph-info-panel">
          <p>
            <strong>Aturan baris:</strong> tanpa parent → phase root; dengan parent → task.
            Phase root berurutan dapat predecessor <strong>FS</strong> otomatis. Gunakan{" "}
            <strong>+ Tambah baris</strong> (akhir list), <strong>+ Fase di awal</strong>,{" "}
            <strong>+ Antara fase</strong> / <strong>+ Baris</strong> per baris. Gunakan{" "}
            <strong>Simpan</strong> untuk menulis ke workspace beta (tabel terpisah).{" "}
            <strong>↑ / ↓</strong> menggeser urutan.{" "}
            <strong>Bobot:</strong> phase root total 100%; task/subtask di bawah parent harus
            jumlahnya sama dengan bobot parent.
          </p>
        </div>
      </header>

      {rows.length > 0 ? (
        <section className="card timeline-editor__panel timeline-editor__panel--preview">
          <div className="timeline-editor__panel-head timeline-editor__panel-head--split">
            <div>
              <h3 className="ui-section__title">Preview timeline</h3>
              <p className="ui-section__desc">
                Gantt dari jadwal sandbox — mengikuti recalc otomatis
                {durationLabel ? (
                  <>
                    {" "}
                    · durasi proyek <strong>{durationLabel}</strong>
                  </>
                ) : null}
              </p>
            </div>
            {parentChildRefs.size > 0 ? (
              <div className="te-tree-toolbar btn-group">
                <button
                  type="button"
                  onClick={() => setCollapsedRefs(expandAllCollapsed())}
                >
                  Buka semua
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsedRefs(collapseAllParentRefs(parentChildRefs))}
                >
                  Ciutkan semua
                </button>
              </div>
            ) : null}
          </div>
          <TimelineEditorGanttPreview
            rows={rows}
            visibleIndices={visibleIndices}
            rowRefFn={rowRef}
            parentRefsWithChildren={parentChildRefs}
            collapsedRefs={collapsedRefs}
            onToggleCollapse={toggleTreeCollapse}
            busy={recalcBusy}
          />
        </section>
      ) : null}

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
            <button type="button" className="primary" onClick={addRowAtEnd}>
              + Tambah baris
            </button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <TimelineEditorEmptyState onAdd={addPhaseAtStart} onReload={() => void loadSnapshot()} />
        ) : (
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
              {!weightCheck.ok ? (
                <ul className="timeline-weight-summary__issues">
                  {weightCheck.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <TimelineEditorTable
              rows={rows}
              visibleIndices={visibleIndices}
              rowRefFn={rowRef}
              depthFn={(row) =>
                rowDepthByParent(row, rows, (r, i) => rowRef(r as TimelineEditorRow, i))
              }
              parentRefsWithChildren={parentChildRefs}
              collapsedRefs={collapsedRefs}
              onToggleCollapse={toggleTreeCollapse}
              predOptions={predOptions}
              onPatch={patchRow}
              onPatchPreds={patchPredecessors}
              onMove={moveRow}
              onRemove={removeRow}
              onAddAfter={(index) => addRowAt(index + 1)}
              onAddPhaseAfterBlock={addRootPhaseAfterBlock}
            />
          </>
        )}
      </section>
    </div>
  );
}
