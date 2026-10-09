import { normalizePredecessorLinkType } from "../../../predecessorLinkTypes";
import type { TimelineEditorPredecessor, TimelineEditorRow } from "../../../components/timeline/types";
import type { MilestoneRow } from "./milestoneTypes";

export function liveMilestoneRowRef(m: MilestoneRow): string {
  if (m.clickup_only && m.clickup_task_id) return `cu:${m.clickup_task_id}`;
  if (m.id > 0) return `m:${m.id}`;
  return `i:${m.timeline_seq ?? m.sort_order ?? 0}`;
}

function livePredToEditor(
  p: NonNullable<MilestoneRow["live_predecessors"]>[number],
): TimelineEditorPredecessor {
  return {
    predecessor_ref: p.predecessor_ref,
    link_type: normalizePredecessorLinkType(p.link_type),
    lag_days: Math.max(0, p.lag_days ?? 0),
  };
}

/** Phase closed / done — EVM lock (mirror rebaseline_diff lifecycle closed). */
export function isLivePhaseEvmLocked(m: MilestoneRow): boolean {
  if ((m.item_type || "").toLowerCase() !== "phase") return false;
  if ((m.status || "").toLowerCase() === "done") return true;
  const raw = (m.clickup_status_raw || m.clickup_status || m.phase_status || "").toUpperCase();
  if (raw === "COMPLETED" || raw === "DONE") return true;
  if (raw.includes("COMPLETE") && (m.clickup_progress_pct ?? 0) >= 99.9) return true;
  return false;
}

export function milestoneRowsToEditorRows(rows: MilestoneRow[]): TimelineEditorRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.timeline_seq ?? a.sort_order ?? (a.id > 0 ? a.id : -a.id + 1_000_000)) -
      (b.timeline_seq ?? b.sort_order ?? (b.id > 0 ? b.id : -b.id + 1_000_000)),
  );

  return sorted.map((m, idx) => {
    const preds = (m.live_predecessors ?? []).map(livePredToEditor);
    const first = preds[0];
    const dur =
      m.display_duration_days ??
      m.duration_days ??
      (m.item_type === "milestone" ? 0 : 1);
    const parentRef =
      m.parent_id != null && m.parent_id > 0 ? `m:${m.parent_id}` : null;

    return {
      row_key: liveMilestoneRowRef(m),
      name: m.name,
      duration_days: Math.max(0, Number(dur) || 0),
      weight_pct: m.weight_pct ?? 0,
      item_type: m.item_type ?? "milestone",
      parent_ref: parentRef,
      parent_id: m.parent_id ?? null,
      sort_order: m.sort_order ?? idx,
      start_date: m.start_date,
      target_date: m.target_date,
      predecessor_ref: first?.predecessor_ref ?? null,
      predecessor_link_type: first ? first.link_type : null,
      predecessors: preds,
      live: {
        milestone_id: m.id,
        module: m.module,
        status: m.status,
        clickup_task_id: m.clickup_task_id,
        clickup_name: m.clickup_name,
        clickup_status: m.clickup_status,
        clickup_status_raw: m.clickup_status_raw,
        clickup_url: m.clickup_url,
        clickup_due_date: m.clickup_due_date,
        clickup_progress_pct: m.clickup_progress_pct,
        clickup_only: m.clickup_only,
        is_payment_milestone: m.is_payment_milestone,
        schedule_anomalies: m.schedule_anomalies,
        depth: m.depth,
        phase_id: m.phase_id,
        phase_status: m.phase_status,
        expandable: m.expandable,
        parent_clickup_task_id: m.parent_clickup_task_id,
        evm_locked: isLivePhaseEvmLocked(m),
      },
    };
  });
}

export type MilestonePatchFromEditor = {
  milestone_id: number;
  body: Record<string, unknown>;
};

/** Map editor patch to PATCH /milestones body (only fields the live tab historically persisted). */
export function editorPatchToMilestoneUpdate(
  row: TimelineEditorRow,
  patch: Partial<TimelineEditorRow>,
): MilestonePatchFromEditor | null {
  const mid = row.live?.milestone_id;
  if (mid == null || mid <= 0 || row.live?.clickup_only) return null;
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.start_date !== undefined) body.start_date = patch.start_date || null;
  if (patch.target_date !== undefined) body.target_date = patch.target_date || null;
  if (patch.weight_pct !== undefined) body.weight_pct = patch.weight_pct;
  if (patch.duration_days !== undefined) body.duration_days = patch.duration_days;
  if (Object.keys(body).length === 0) return null;
  return { milestone_id: mid, body };
}
