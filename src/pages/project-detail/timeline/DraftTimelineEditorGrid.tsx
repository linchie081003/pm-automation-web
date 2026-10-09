import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import {
  draftRowsWithParentRefs,
  draftTimelineRecalcPayload,
} from "../../../components/timeline/draftTimelinePayload";
import { TimelineEditorTable } from "../../../components/timeline/TimelineEditorTable";
import { TimelineEditorGanttPreview } from "./TimelineEditorGanttPreview";
import type { TimelineEditorRow } from "../../../components/timeline/types";
import {
  formatDraftWeightErrors,
  validateDraftTimelineWeight,
} from "../../../lib/timelineWeightValidation";
import {
  formatProjectTimelineSummary,
  type ProjectTimelineSummary,
} from "../../../timelineProjectDuration";
import { rowDepthByParent } from "./timelineEditorUi";
import {
  collapseAllParentRefs,
  expandAllCollapsed,
  parentRefsWithChildren,
  toggleCollapsedRef,
  visibleTimelineEditorIndices,
} from "./timelineEditorCollapse";
import {
  draftRowRef,
  draftRowsToEditorRows,
  editorRowsToDraftRows,
  mergeDraftRecalcResponse,
  patchEditorRowSchedule,
  syncEditorPredecessors,
} from "./draftRowAdapter";
import type { DraftTimelineRow } from "./draftTypes";
import {
  buildNewRowAt,
  buildRootPhaseRow,
  moveEditorRow,
  normalizeEditorSortOrder,
  phaseBlockEndIndex,
} from "./draftTimelineEditorOps";

type Props = {
  canEdit: boolean;
  projectId: number;
  timelineStart: string | null;
  draftTimeline: DraftTimelineRow[];
  setDraftTimeline: (rows: DraftTimelineRow[]) => void;
  projectTimeline?: ProjectTimelineSummary | null;
  onProjectTimelineChange?: (summary: ProjectTimelineSummary | null) => void;
  onSave: () => void | Promise<void>;
};

export function DraftTimelineTable({
  canEdit,
  projectId,
  timelineStart,
  draftTimeline,
  setDraftTimeline,
  projectTimeline,
  onProjectTimelineChange,
  onSave,
}: Props) {
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcError, setRecalcError] = useState("");
  const [collapsedRefs, setCollapsedRefs] = useState<Set<string>>(() => new Set());
  const recalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editorRows = useMemo(
    () => draftRowsToEditorRows(draftRowsWithParentRefs(draftTimeline)),
    [draftTimeline],
  );

  const scheduleServerRecalc = useCallback(
    (sentDraft: DraftTimelineRow[]) => {
      if (!canEdit || !timelineStart?.trim()) return;
      const weightPreview = validateDraftTimelineWeight(draftRowsWithParentRefs(sentDraft));
      if (!weightPreview.ok) {
        setRecalcError(
          "Hitung ulang tanggal ditunda — perbaiki bobot/struktur timeline terlebih dahulu (lihat daftar di atas).",
        );
        return;
      }
      if (recalcTimer.current) clearTimeout(recalcTimer.current);
      recalcTimer.current = setTimeout(() => {
        setRecalcBusy(true);
        setRecalcError("");
        const sentEditor = draftRowsToEditorRows(draftRowsWithParentRefs(sentDraft));
        api<{
          draft_timeline: DraftTimelineRow[];
          project_timeline?: ProjectTimelineSummary;
        }>(`/projects/${projectId}/sph/draft-timeline/recalc`, {
          method: "POST",
          body: JSON.stringify(draftTimelineRecalcPayload(sentDraft, timelineStart)),
        })
          .then((res) => {
            setDraftTimeline(
              mergeDraftRecalcResponse(
                sentEditor,
                draftRowsWithParentRefs(res.draft_timeline),
              ),
            );
            onProjectTimelineChange?.(res.project_timeline ?? null);
          })
          .catch((e) => {
            setRecalcError(getErrorMessage(e));
          })
          .finally(() => setRecalcBusy(false));
      }, 450);
    },
    [canEdit, projectId, timelineStart, setDraftTimeline, onProjectTimelineChange],
  );

  const commitEditorRows = useCallback(
    (rows: TimelineEditorRow[], recalc = true) => {
      const draft = editorRowsToDraftRows(rows);
      setDraftTimeline(draft);
      if (recalc) scheduleServerRecalc(draft);
    },
    [setDraftTimeline, scheduleServerRecalc],
  );

  const projectDurationLabel = formatProjectTimelineSummary(projectTimeline);

  useEffect(
    () => () => {
      if (recalcTimer.current) clearTimeout(recalcTimer.current);
    },
    [],
  );

  const timelineStartRecalcReady = useRef(false);
  useEffect(() => {
    if (!timelineStartRecalcReady.current) {
      timelineStartRecalcReady.current = true;
      return;
    }
    if (!canEdit || !timelineStart?.trim() || draftTimeline.length === 0) return;
    scheduleServerRecalc(draftTimeline);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalc when project start changes
  }, [timelineStart]);

  const weightCheck = useMemo(
    () => validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    [draftTimeline],
  );

  const parentChildRefs = useMemo(() => parentRefsWithChildren(editorRows), [editorRows]);
  const visibleIndices = useMemo(
    () => visibleTimelineEditorIndices(editorRows, draftRowRef, collapsedRefs),
    [editorRows, collapsedRefs],
  );

  const predOptions = useMemo(
    () =>
      editorRows.map((r, i) => ({
        ref: draftRowRef(r, i),
        label: r.name || draftRowRef(r, i),
        item_type: r.item_type,
      })),
    [editorRows],
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
        {projectDurationLabel && (
          <p className="timeline-weight-summary__line timeline-weight-summary__line--project">
            Durasi proyek (dari timeline): <strong>{projectDurationLabel}</strong>
            <span className="text-muted">
              {" "}
              — hari kerja inclusive, mulai paling awal → selesai paling akhir
            </span>
          </p>
        )}
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
        {recalcError && (
          <p className="timeline-weight-summary__issues" style={{ marginTop: "0.5rem" }}>
            {recalcError}
          </p>
        )}
        <p className="text-muted timeline-weight-summary__hint">
          Aturan: total phase root = 100%; jumlah bobot anak (task/subtask) = bobot parent (±0,5%).
          Mulai/selesai mengikuti kalender kerja + libur. Ubah durasi / tanggal / predecessor —
          recalc otomatis ke <code>/sph/draft-timeline/recalc</code>.
          {recalcBusy ? " Menghitung ulang tanggal…" : ""}
        </p>
      </div>

      <section
        className="card timeline-editor__panel timeline-editor__panel--preview"
        style={{ marginBottom: "1rem" }}
      >
        <div className="timeline-editor__panel-head timeline-editor__panel-head--split">
          <div>
            <h3 className="ui-section__title">Preview timeline (Gantt)</h3>
            <p className="ui-section__desc">
              Gantt dari draft baseline — mengikuti recalc otomatis
              {projectDurationLabel ? (
                <>
                  {" "}
                  · durasi proyek <strong>{projectDurationLabel}</strong>
                </>
              ) : null}
            </p>
          </div>
          {parentChildRefs.size > 0 ? (
            <div className="te-tree-toolbar btn-group">
              <button type="button" onClick={() => setCollapsedRefs(expandAllCollapsed())}>
                Buka semua
              </button>
              <button
                type="button"
                onClick={() => setCollapsedRefs(collapseAllParentRefs(parentChildRefs))}
              >
                Tutup semua
              </button>
            </div>
          ) : null}
        </div>
        <TimelineEditorGanttPreview
          rows={editorRows}
          visibleIndices={visibleIndices}
          rowRefFn={draftRowRef}
          parentRefsWithChildren={parentChildRefs}
          collapsedRefs={collapsedRefs}
          onToggleCollapse={(ref) => setCollapsedRefs((p) => toggleCollapsedRef(p, ref))}
          busy={recalcBusy}
          legendNote="Draft SPH / Kick Off — tanpa progress ClickUp"
        />
      </section>

      <section className="card timeline-editor__panel">
        <h3 className="ui-section__title">Grid draft timeline</h3>
        <TimelineEditorTable
        variant="editor"
        showNotesColumn
        alwaysShowPredecessorRow
        rows={editorRows}
        visibleIndices={visibleIndices}
        rowRefFn={draftRowRef}
        depthFn={(row) =>
          rowDepthByParent(row, editorRows, (r, i) => draftRowRef(r as TimelineEditorRow, i))
        }
        parentRefsWithChildren={parentChildRefs}
        collapsedRefs={collapsedRefs}
        onToggleCollapse={(ref) => setCollapsedRefs((p) => toggleCollapsedRef(p, ref))}
        predOptions={predOptions}
        rowLock={
          canEdit
            ? () => ({ locked: false })
            : () => ({
                locked: true,
                reason: "Draft timeline read-only",
              })
        }
        onPatch={(index, patch) => {
          let next = editorRows.map((r, i) => (i === index ? { ...r, ...patch } : r));
          if (patch.duration_days != null) {
            next = patchEditorRowSchedule(next, index, { ...patch, target_date: null }, "duration");
          } else if (patch.start_date !== undefined) {
            next = patchEditorRowSchedule(
              next,
              index,
              { ...patch, target_date: null },
              "start",
            );
          } else if (patch.target_date !== undefined) {
            const isMilestone = (next[index].item_type || "").toLowerCase() === "milestone";
            if (isMilestone) {
              next = patchEditorRowSchedule(
                next,
                index,
                {
                  target_date: patch.target_date,
                  start_date: patch.target_date,
                },
                "milestone",
              );
            } else {
              next = patchEditorRowSchedule(next, index, patch, "end");
            }
          } else if (patch.item_type === "milestone") {
            next[index] = {
              ...next[index],
              weight_pct: 0,
              duration_days: 0,
              predecessors: [],
            };
          }
          const recalc =
            patch.duration_days != null ||
            patch.start_date !== undefined ||
            patch.target_date !== undefined ||
            patch.parent_ref !== undefined ||
            patch.predecessors !== undefined ||
            patch.predecessor_ref !== undefined ||
            patch.item_type !== undefined;
          commitEditorRows(next, recalc);
        }}
        onPatchPreds={(index, preds) => {
          const next = syncEditorPredecessors(editorRows, index, preds);
          commitEditorRows(next, true);
        }}
        onMove={(index, dir) => {
          commitEditorRows(moveEditorRow(editorRows, index, dir), true);
        }}
        onRemove={(index) => {
          const removedRef = draftRowRef(editorRows[index], index);
          const next = normalizeEditorSortOrder(
            editorRows
              .filter((_, i) => i !== index)
              .map((r) => ({
                ...r,
                predecessors: (r.predecessors ?? []).filter(
                  (p) => p.predecessor_ref !== removedRef,
                ),
              })),
          );
          commitEditorRows(next, true);
        }}
        onAddAfter={(index) => {
          const insertAt = index + 1;
          const next = normalizeEditorSortOrder([
            ...editorRows.slice(0, insertAt),
            buildNewRowAt(editorRows, insertAt),
            ...editorRows.slice(insertAt),
          ]);
          commitEditorRows(next, true);
        }}
        onAddPhaseAfterBlock={(index) => {
          const insertAt = phaseBlockEndIndex(editorRows, index);
          const next = normalizeEditorSortOrder([
            ...editorRows.slice(0, insertAt),
            buildRootPhaseRow(editorRows, insertAt),
            ...editorRows.slice(insertAt),
          ]);
          commitEditorRows(next, true);
        }}
      />
      </section>

      {canEdit && (
        <>
          <div className="ui-toolbar ui-toolbar--start">
            <button
              type="button"
              className="btn-add-row"
              onClick={() => {
                const insertAt = editorRows.length;
                const next = normalizeEditorSortOrder([
                  ...editorRows,
                  buildNewRowAt(editorRows, insertAt),
                ]);
                setRecalcError("");
                commitEditorRows(next, true);
              }}
            >
              + Tambah baris timeline
            </button>
          </div>
          <div className="tab-form-footer">
            <p className="form-hint">Menyimpan draft timeline dan menghitung ulang tanggal dari kalender kerja.</p>
            <button
              type="button"
              className="primary"
              disabled={!weightCheck.ok}
              title={
                !weightCheck.ok
                  ? "Perbaiki bobot/struktur timeline sebelum simpan"
                  : undefined
              }
              onClick={handleSave}
            >
              Simpan & hitung ulang tanggal
            </button>
          </div>
        </>
      )}
    </>
  );
}
