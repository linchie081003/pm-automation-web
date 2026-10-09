import { newId } from "../../../lib/newId";
import type { TimelineEditorPredecessor, TimelineEditorRow } from "../../../components/timeline/types";
import { draftRowRef } from "./draftRowAdapter";

export function normalizeEditorSortOrder(rows: TimelineEditorRow[]): TimelineEditorRow[] {
  return rows.map((r, i) => ({ ...r, sort_order: i }));
}

export function moveEditorRow(
  rows: TimelineEditorRow[],
  index: number,
  direction: -1 | 1,
): TimelineEditorRow[] {
  const j = index + direction;
  if (j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[j]] = [next[j], next[index]];
  return normalizeEditorSortOrder(next);
}

function isRootPhaseRow(row: TimelineEditorRow): boolean {
  return !row.parent_ref && (row.item_type || "phase").toLowerCase() === "phase";
}

function previousRootPhaseRef(rows: TimelineEditorRow[], beforeIndex: number): string | null {
  for (let j = beforeIndex - 1; j >= 0; j--) {
    if (isRootPhaseRow(rows[j])) return draftRowRef(rows[j], j);
  }
  return null;
}

export function phaseBlockEndIndex(rows: TimelineEditorRow[], rowIndex: number): number {
  const rootIdx = rootPhaseIndexForRow(rows, rowIndex);
  if (!isRootPhaseRow(rows[rootIdx])) {
    return Math.min(rowIndex + 1, rows.length);
  }
  const rootKey = draftRowRef(rows[rootIdx], rootIdx);
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
      const pi = rows.findIndex((r, i) => draftRowRef(r, i) === p);
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

function rootPhaseIndexForRow(rows: TimelineEditorRow[], rowIndex: number): number {
  if (isRootPhaseRow(rows[rowIndex])) return rowIndex;
  let cur = rows[rowIndex]?.parent_ref?.trim() || "";
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const idx = rows.findIndex((r, i) => draftRowRef(r, i) === cur);
    if (idx < 0) break;
    if (isRootPhaseRow(rows[idx])) return idx;
    cur = rows[idx].parent_ref?.trim() || "";
  }
  return rowIndex;
}

function defaultChildWeight(rows: TimelineEditorRow[], parentRef: string | null): number {
  if (!parentRef) return 0;
  const parentIdx = rows.findIndex((r, i) => draftRowRef(r, i) === parentRef);
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
  return Math.max(0, parentWeight - siblingSum);
}

export function buildRootPhaseRow(rows: TimelineEditorRow[], insertAt: number): TimelineEditorRow {
  const pred = previousRootPhaseRef(rows, insertAt);
  return {
    row_key: `row_${newId().slice(0, 8)}`,
    name: "Fase baru",
    duration_days: 1,
    weight_pct: 0,
    item_type: "phase",
    parent_ref: null,
    sort_order: insertAt,
    predecessors: pred ? [{ predecessor_ref: pred, link_type: "FS", lag_days: 0 }] : [],
    schedule_driver: "duration",
    notes: "",
  };
}

export function buildNewRowAt(rows: TimelineEditorRow[], insertAt: number): TimelineEditorRow {
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
      parent_ref = draftRowRef(rowBefore, beforeIdx);
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
    if (pred) predecessors = [{ predecessor_ref: pred, link_type: "FS", lag_days: 0 }];
  }

  const weight_pct =
    parent_ref && item_type !== "milestone" ? defaultChildWeight(rows, parent_ref) : 0;

  return {
    row_key: `row_${newId().slice(0, 8)}`,
    name: "Baru",
    duration_days: 1,
    weight_pct,
    item_type,
    parent_ref,
    sort_order: insertAt,
    predecessors,
    schedule_driver: "duration",
    notes: "",
  };
}
