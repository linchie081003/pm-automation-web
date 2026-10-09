import { useCallback, useMemo, useState } from "react";
import { api } from "../../../api";
import { formatDisplayDate } from "../../../lib/formatDate";
import { TimelineEditorTable } from "../../../components/timeline/TimelineEditorTable";
import type { TimelineEditorRow, TimelineEditorRowLock } from "../../../components/timeline/types";
import { TimelineEditorGanttPreview } from "./TimelineEditorGanttPreview";
import { rowDepthByParent } from "./timelineEditorUi";
import {
  collapseAllParentRefs,
  expandAllCollapsed,
  parentRefsWithChildren,
  toggleCollapsedRef,
  visibleTimelineEditorIndices,
} from "./timelineEditorCollapse";
import { editorPatchToMilestoneUpdate, milestoneRowsToEditorRows } from "./milestoneRowAdapter";
import type { MilestoneRow } from "./milestoneTypes";
import type { ReactNode } from "react";

type Props = {
  projectId: number;
  items: MilestoneRow[];
  canWriteStructure: boolean;
  onReload: () => void;
  onRemove: (id: number, name: string) => void;
  renderLiveMeta: (m: MilestoneRow, row: TimelineEditorRow) => ReactNode;
};

function rowRef(row: TimelineEditorRow, index: number): string {
  return row.row_key?.trim() || `i_${index}`;
}

export function MilestonesLiveTimeline({
  projectId,
  items,
  canWriteStructure,
  onReload,
  onRemove,
  renderLiveMeta,
}: Props) {
  const [collapsedRefs, setCollapsedRefs] = useState<Set<string>>(() => new Set());
  const [collapsedCu, setCollapsedCu] = useState<Set<string>>(() => new Set());

  const milestoneById = useMemo(() => {
    const map = new Map<number, MilestoneRow>();
    for (const m of items) {
      if (m.id > 0) map.set(m.id, m);
    }
    return map;
  }, [items]);

  const editorRows = useMemo(() => milestoneRowsToEditorRows(items), [items]);

  const visibleIndices = useMemo(() => {
    const base = visibleTimelineEditorIndices(editorRows, rowRef, collapsedRefs);
    return base.filter((index) => {
      const row = editorRows[index];
      const live = row.live;
      const phaseId = live?.phase_id ?? (row.item_type === "phase" ? live?.milestone_id : null);
      if (
        phaseId != null &&
        collapsedRefs.has(`m:${phaseId}`) &&
        row.item_type !== "phase"
      ) {
        return false;
      }
      if (live?.parent_clickup_task_id && collapsedCu.has(live.parent_clickup_task_id)) {
        return false;
      }
      return true;
    });
  }, [editorRows, collapsedRefs, collapsedCu]);

  const parentChildRefs = useMemo(() => parentRefsWithChildren(editorRows), [editorRows]);

  const predOptions = useMemo(
    () =>
      editorRows.map((r, i) => ({
        ref: rowRef(r, i),
        label: r.name || rowRef(r, i),
        item_type: r.item_type,
      })),
    [editorRows],
  );

  const rowLock = useCallback(
    (row: TimelineEditorRow): TimelineEditorRowLock => {
      if (!canWriteStructure) {
        return { locked: true, reason: "Timeline read-only — tidak ada izin milestones.write atau fase proyek." };
      }
      if (row.live?.clickup_only) {
        return { locked: true, reason: "Baris hanya dari ClickUp — edit di ClickUp atau lewat rebaseline." };
      }
      if (row.live?.milestone_id != null && row.live.milestone_id <= 0) {
        return { locked: true, reason: "Baris tidak terhubung ke milestone PDC." };
      }
      if (row.live?.evm_locked) {
        return { locked: true, reason: "Fase selesai (EVM) — bobot dan tanggal terkunci." };
      }
      return { locked: false };
    },
    [canWriteStructure],
  );

  const patchLiveRow = async (index: number, patch: Partial<TimelineEditorRow>) => {
    const row = editorRows[index];
    const lock = rowLock(row);
    if (lock.locked) return;
    const update = editorPatchToMilestoneUpdate(row, patch);
    if (!update) return;
    await api(`/projects/${projectId}/milestones/${update.milestone_id}`, {
      method: "PATCH",
      body: JSON.stringify(update.body),
    });
    onReload();
  };

  const toggleTreeCollapse = useCallback((ref: string) => {
    setCollapsedRefs((prev) => toggleCollapsedRef(prev, ref));
  }, []);

  const togglePhaseCollapse = (phaseId: number) => {
    const ref = `m:${phaseId}`;
    setCollapsedRefs((prev) => toggleCollapsedRef(prev, ref));
  };

  const toggleCuCollapse = (clickupTaskId: string) => {
    setCollapsedCu((prev) => {
      const next = new Set(prev);
      if (next.has(clickupTaskId)) next.delete(clickupTaskId);
      else next.add(clickupTaskId);
      return next;
    });
  };

  if (!editorRows.length) return null;

  return (
    <>
      <section className="card timeline-editor__panel timeline-editor__panel--preview" style={{ marginBottom: "1rem" }}>
        <div className="timeline-editor__panel-head timeline-editor__panel-head--split">
          <div>
            <h3 className="ui-section__title">Timeline (Gantt)</h3>
            <p className="ui-section__desc">Jadwal live — baseline Kick Off + progress ClickUp di baris meta.</p>
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
          rowRefFn={rowRef}
          parentRefsWithChildren={parentChildRefs}
          collapsedRefs={collapsedRefs}
          onToggleCollapse={(ref) => {
            if (ref.startsWith("m:")) {
              const id = Number(ref.slice(2));
              if (Number.isFinite(id)) togglePhaseCollapse(id);
            } else toggleTreeCollapse(ref);
          }}
        />
      </section>

      <section className="card timeline-editor__panel">
        <h3 className="ui-section__title">Grid jadwal live</h3>
        <TimelineEditorTable
          variant="live"
          rows={editorRows}
          visibleIndices={visibleIndices}
          rowRefFn={rowRef}
          depthFn={(row) =>
            rowDepthByParent(row, editorRows, (r, i) => rowRef(r as TimelineEditorRow, i))
          }
          parentRefsWithChildren={parentChildRefs}
          collapsedRefs={collapsedRefs}
          onToggleCollapse={(ref) => {
            const row = editorRows.find((r, i) => rowRef(r, i) === ref);
            if (row?.item_type === "phase" && row.live?.milestone_id) {
              togglePhaseCollapse(row.live.milestone_id);
              return;
            }
            if (row?.live?.expandable && row.live.clickup_task_id) {
              toggleCuCollapse(row.live.clickup_task_id);
              return;
            }
            toggleTreeCollapse(ref);
          }}
          predOptions={predOptions}
          rowLock={rowLock}
          onPatch={(index, patch) => {
            void patchLiveRow(index, patch).catch(() => onReload());
          }}
          onPatchPreds={() => {}}
          onMove={() => {}}
          onRemove={(index) => {
            const row = editorRows[index];
            const mid = row.live?.milestone_id;
            if (mid && mid > 0) onRemove(mid, row.name);
          }}
          onAddAfter={() => {}}
          onAddPhaseAfterBlock={() => {}}
          renderLiveMetaRow={(row) => {
            const mid = row.live?.milestone_id;
            const m = mid != null ? milestoneById.get(mid) : undefined;
            if (!m) return null;
            return renderLiveMeta(m, row);
          }}
        />
      </section>
    </>
  );
}

export function milestoneLiveTooltip(row: MilestoneRow): string {
  const parts = [
    row.name,
    `Baseline: ${formatDisplayDate(row.start_date)} → ${formatDisplayDate(row.target_date)}`,
  ];
  if (row.live_predecessors?.length) {
    parts.push(
      `Predecessor: ${row.live_predecessors
        .map(
          (p) =>
            `${p.predecessor_name ?? p.predecessor_ref} (${p.link_type}${
              p.lag_days ? ` +${p.lag_days}HK` : ""
            })`,
        )
        .join(", ")}`,
    );
  }
  return parts.join("\n");
}
