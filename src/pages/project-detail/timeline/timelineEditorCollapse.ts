import type { TimelineEditorRow } from "./types";

export function parentRefsWithChildren(
  rows: TimelineEditorRow[],
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const p = row.parent_ref?.trim();
    if (p) out.add(p);
  }
  return out;
}

/** Row indices visible when ancestors in `collapsedRefs` are expanded. */
export function visibleTimelineEditorIndices(
  rows: TimelineEditorRow[],
  rowRefFn: (row: TimelineEditorRow, index: number) => string,
  collapsedRefs: Set<string>,
): number[] {
  if (!collapsedRefs.size) {
    return rows.map((_, i) => i);
  }

  const refAt = (index: number) => rowRefFn(rows[index], index);

  const isHidden = (index: number): boolean => {
    let cur = rows[index].parent_ref?.trim() || "";
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (collapsedRefs.has(cur)) return true;
      const pi = rows.findIndex((_r, i) => refAt(i) === cur);
      if (pi < 0) break;
      cur = rows[pi].parent_ref?.trim() || "";
    }
    return false;
  };

  return rows.map((_, i) => i).filter((i) => !isHidden(i));
}

export function toggleCollapsedRef(prev: Set<string>, ref: string): Set<string> {
  const next = new Set(prev);
  if (next.has(ref)) next.delete(ref);
  else next.add(ref);
  return next;
}

export function collapseAllParentRefs(refs: Set<string>): Set<string> {
  return new Set(refs);
}

export function expandAllCollapsed(): Set<string> {
  return new Set();
}
