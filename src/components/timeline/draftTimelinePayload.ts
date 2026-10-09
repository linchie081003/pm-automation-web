import { normalizePredecessorLinkType } from "../../predecessorLinkTypes";
import type { TimelineEditorPredecessor } from "./types";

export type DraftTimelinePayloadRow = {
  id?: number;
  row_key?: string;
  name: string;
  duration_days: number;
  weight_pct: number;
  item_type: string;
  parent_ref?: string | null;
  parent_id?: number | null;
  sort_order: number;
  start_date?: string | null;
  target_date?: string | null;
  predecessor_ref?: string | null;
  predecessor_link_type?: string | null;
  schedule_driver?: "duration" | "start" | "end" | null;
  predecessors?: TimelineEditorPredecessor[];
  notes?: string | null;
};

export function normalizeDraftPredecessors(row: DraftTimelinePayloadRow): TimelineEditorPredecessor[] {
  if (row.predecessors?.length) {
    return row.predecessors.map((p) => ({
      predecessor_ref: p.predecessor_ref,
      link_type: normalizePredecessorLinkType(p.link_type),
      lag_days: Math.max(0, p.lag_days ?? 0),
    }));
  }
  const ref = row.predecessor_ref?.trim();
  if (!ref) return [];
  return [
    {
      predecessor_ref: ref,
      link_type: normalizePredecessorLinkType(row.predecessor_link_type),
      lag_days: 0,
    },
  ];
}

export function draftRowsWithParentRefs<T extends DraftTimelinePayloadRow>(rows: T[]): T[] {
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

export function draftTimelineRecalcPayload(
  rows: DraftTimelinePayloadRow[],
  startDate: string | null,
) {
  return {
    start_date: startDate || null,
    rows: draftRowsWithParentRefs(rows).map((r, idx) => {
      const preds = normalizeDraftPredecessors(r);
      const first = preds[0];
      return {
        id: r.id,
        row_key: r.row_key || String(r.id || idx),
        name: r.name,
        duration_days: r.item_type === "milestone" ? 0 : r.duration_days,
        weight_pct: r.item_type === "milestone" ? 0 : r.weight_pct,
        item_type: r.item_type,
        parent_ref: r.parent_ref || null,
        parent_id: r.parent_id ?? null,
        sort_order: idx,
        start_date: r.start_date || null,
        target_date: r.target_date || null,
        predecessor_ref: first?.predecessor_ref ?? (r.predecessor_ref?.trim() || null),
        predecessor_link_type: first
          ? normalizePredecessorLinkType(first.link_type)
          : r.predecessor_ref?.trim()
            ? normalizePredecessorLinkType(r.predecessor_link_type)
            : null,
        schedule_driver: r.schedule_driver ?? null,
        predecessors: preds,
      };
    }),
  };
}

export function syncLegacyPredecessorFields(
  row: DraftTimelinePayloadRow,
  preds: TimelineEditorPredecessor[],
): DraftTimelinePayloadRow {
  const first = preds[0];
  return {
    ...row,
    predecessors: preds,
    predecessor_ref: first?.predecessor_ref ?? null,
    predecessor_link_type: first ? normalizePredecessorLinkType(first.link_type) : null,
  };
}
