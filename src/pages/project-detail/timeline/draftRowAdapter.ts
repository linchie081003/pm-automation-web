import {
  normalizeDraftPredecessors,
  syncLegacyPredecessorFields,
  type DraftTimelinePayloadRow,
} from "../../../components/timeline/draftTimelinePayload";
import type { TimelineEditorPredecessor, TimelineEditorRow } from "../../../components/timeline/types";
import type { DraftTimelineRow } from "./draftTypes";

export function draftRowRef(row: DraftTimelineRow | TimelineEditorRow, index: number): string {
  return row.row_key?.trim() || String(row.id ?? `i_${index}`);
}

export function draftRowsToEditorRows(rows: DraftTimelineRow[]): TimelineEditorRow[] {
  return rows.map((r, idx) => {
    const preds = normalizeDraftPredecessors(r);
    const synced = syncLegacyPredecessorFields(r, preds);
    const first = preds[0];
    return {
      id: r.id ?? null,
      row_key: r.row_key ?? (r.id != null ? String(r.id) : `row_${idx}`),
      name: r.name,
      duration_days: r.item_type === "milestone" ? 0 : r.duration_days ?? 1,
      weight_pct: r.item_type === "milestone" ? 0 : r.weight_pct ?? 0,
      item_type: r.item_type || "phase",
      parent_ref: synced.parent_ref ?? null,
      parent_id: r.parent_id ?? null,
      sort_order: r.sort_order ?? idx,
      start_date: r.start_date ?? null,
      target_date: r.target_date ?? null,
      predecessor_ref: synced.predecessor_ref ?? first?.predecessor_ref ?? null,
      predecessor_link_type: synced.predecessor_link_type ?? first?.link_type ?? null,
      schedule_driver:
        r.schedule_driver ??
        ((r.item_type || "").toLowerCase() === "milestone" && (r.target_date || r.start_date)
          ? "milestone"
          : null),
      predecessors: preds,
      notes: r.notes ?? "",
    };
  });
}

function editorRowAsPayload(r: TimelineEditorRow): DraftTimelinePayloadRow {
  return {
    id: r.id ?? undefined,
    row_key: r.row_key ?? undefined,
    name: r.name,
    duration_days: r.duration_days ?? 1,
    weight_pct: r.weight_pct ?? 0,
    item_type: r.item_type || "phase",
    parent_ref: r.parent_ref ?? null,
    parent_id: r.parent_id ?? null,
    sort_order: r.sort_order ?? 0,
    start_date: r.start_date ?? null,
    target_date: r.target_date ?? null,
    predecessor_ref: r.predecessor_ref ?? null,
    predecessor_link_type: r.predecessor_link_type ?? null,
    schedule_driver:
      r.schedule_driver === "milestone" || r.schedule_driver == null
        ? null
        : r.schedule_driver,
    predecessors: r.predecessors,
    notes: r.notes ?? null,
  };
}

export function editorRowsToDraftRows(rows: TimelineEditorRow[]): DraftTimelineRow[] {
  return rows.map((r, idx) => {
    const preds = r.predecessors?.length
      ? r.predecessors
      : normalizeDraftPredecessors(editorRowAsPayload(r));
    const base: DraftTimelineRow = {
      id: r.id ?? undefined,
      row_key: r.row_key ?? undefined,
      name: r.name,
      duration_days: r.item_type === "milestone" ? 0 : r.duration_days ?? 1,
      weight_pct: r.item_type === "milestone" ? 0 : r.weight_pct ?? 0,
      item_type: r.item_type || "phase",
      parent_ref: r.parent_ref ?? null,
      parent_id: r.parent_id ?? null,
      sort_order: r.sort_order ?? idx,
      start_date: r.start_date ?? null,
      target_date: r.target_date ?? null,
      schedule_driver:
        r.schedule_driver === "milestone" || r.schedule_driver == null
          ? null
          : r.schedule_driver,
      notes: r.notes ?? "",
      predecessors: preds,
    };
    return syncLegacyPredecessorFields(base, preds);
  });
}

export function normalizeDraftSortOrder(rows: DraftTimelineRow[]): DraftTimelineRow[] {
  return rows.map((r, i) => ({ ...r, sort_order: i }));
}

export function enrichDraftRowsFromServer(rows: DraftTimelineRow[]): DraftTimelineRow[] {
  return rows.map((r) => {
    const preds = normalizeDraftPredecessors(r);
    return syncLegacyPredecessorFields({ ...r, predecessors: preds }, preds);
  });
}

export function mergeDraftTimelineNotes(
  prev: DraftTimelineRow[],
  fromServer: DraftTimelineRow[],
): DraftTimelineRow[] {
  const notesByKey = new Map(
    prev.map((r) => [r.row_key ?? String(r.id ?? ""), r.notes ?? ""]),
  );
  return fromServer.map((r) => ({
    ...r,
    notes: notesByKey.get(r.row_key ?? String(r.id ?? "")) ?? r.notes ?? "",
  }));
}

/** After recalc API: keep user-edited fields (notes, name, preds sent) on matching row_key. */
export function mergeDraftRecalcResponse(
  sent: TimelineEditorRow[],
  fromApi: DraftTimelineRow[],
): DraftTimelineRow[] {
  const enriched = enrichDraftRowsFromServer(fromApi);
  const apiEditors = draftRowsToEditorRows(enriched);
  const apiByKey = new Map(apiEditors.map((r, i) => [draftRowRef(r, i), r]));
  const mergedEditors = sent.map((s, i) => {
    const key = draftRowRef(s, i);
    const fromServer = apiByKey.get(key);
    const preds =
      s.predecessors?.length
        ? s.predecessors
        : fromServer?.predecessors?.length
          ? fromServer.predecessors
          : [];
    if (!fromServer) {
      return { ...s, sort_order: i, predecessors: preds, notes: s.notes ?? "" };
    }
    return {
      ...fromServer,
      sort_order: i,
      name: s.name,
      parent_ref: s.parent_ref,
      item_type: s.item_type,
      weight_pct: s.weight_pct ?? 0,
      schedule_driver: s.schedule_driver ?? fromServer.schedule_driver,
      duration_days: fromServer.duration_days ?? s.duration_days ?? 1,
      predecessors: preds,
      notes: s.notes ?? fromServer.notes ?? "",
    };
  });
  return editorRowsToDraftRows(
    mergedEditors.map((r, idx) => ({ ...r, sort_order: idx })),
  );
}

export function patchEditorRowSchedule(
  rows: TimelineEditorRow[],
  index: number,
  patch: Partial<TimelineEditorRow>,
  driver: "duration" | "start" | "end" | "milestone",
): TimelineEditorRow[] {
  const next = [...rows];
  const cur = next[index];
  next[index] = {
    ...cur,
    ...patch,
    schedule_driver: driver === "milestone" ? "milestone" : driver,
  };
  return next;
}

export function syncEditorPredecessors(
  rows: TimelineEditorRow[],
  index: number,
  preds: TimelineEditorPredecessor[],
): TimelineEditorRow[] {
  const next = [...rows];
  const draft = syncLegacyPredecessorFields(
    editorRowsToDraftRows([next[index]])[0],
    preds,
  );
  next[index] = {
    ...next[index],
    predecessors: preds,
    predecessor_ref: draft.predecessor_ref ?? null,
    predecessor_link_type: draft.predecessor_link_type ?? null,
    schedule_driver: "duration",
    target_date: null,
  };
  return next;
}
