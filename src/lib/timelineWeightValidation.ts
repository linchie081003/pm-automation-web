export const TIMELINE_WEIGHT_TOLERANCE = 0.5;

export type DraftWeightRow = {
  id?: number;
  row_key?: string;
  name: string;
  weight_pct: number;
  item_type: string;
  parent_ref?: string | null;
};

export type DraftWeightValidation = {
  ok: boolean;
  rootTotal: number;
  issues: string[];
};

function rowKeys(rows: DraftWeightRow[]): { row: DraftWeightRow; key: string }[] {
  return rows.map((r, idx) => ({
    row: r,
    key: String(r.row_key || r.id || `row_${idx}`),
  }));
}

export function validateDraftTimelineWeight(
  rows: DraftWeightRow[],
): DraftWeightValidation {
  const issues: string[] = [];
  if (!rows.length) {
    return { ok: false, rootTotal: 0, issues: ["Timeline kosong."] };
  }

  const keyed = rowKeys(rows);
  const keySet = new Set(keyed.map((k) => k.key));

  for (const { row } of keyed) {
    if (row.parent_ref && !keySet.has(row.parent_ref)) {
      issues.push(`Parent «${row.parent_ref}» tidak ditemukan (baris «${row.name}»).`);
    }
  }

  const roots = keyed.filter(({ row }) => !row.parent_ref);
  const phaseRoots = roots.filter(
    ({ row }) => (row.item_type || "phase").toLowerCase() === "phase",
  );
  const rootTotal = phaseRoots.reduce(
    (s, { row }) => s + (row.item_type === "milestone" ? 0 : Number(row.weight_pct) || 0),
    0,
  );

  if (!phaseRoots.length) {
    issues.push("Minimal satu phase di root.");
  } else if (Math.abs(rootTotal - 100) > TIMELINE_WEIGHT_TOLERANCE) {
    issues.push(
      `Total bobot phase root ${rootTotal.toFixed(1)}% — harus 100% (±${TIMELINE_WEIGHT_TOLERANCE}).`,
    );
  }

  for (const { row: parent, key: parentKey } of keyed) {
    if ((parent.item_type || "").toLowerCase() === "milestone") continue;
    const children = keyed.filter(({ row }) => row.parent_ref === parentKey);
    const weightedChildren = children.filter(
      ({ row }) => (row.item_type || "").toLowerCase() !== "milestone",
    );
    if (!weightedChildren.length) continue;
    const childSum = weightedChildren.reduce(
      (s, { row }) => s + (Number(row.weight_pct) || 0),
      0,
    );
    const parentWeight = Number(parent.weight_pct) || 0;
    if (Math.abs(childSum - parentWeight) > TIMELINE_WEIGHT_TOLERANCE) {
      issues.push(
        `Bobot anak «${parent.name}» = ${childSum.toFixed(1)}% harus sama dengan bobot parent ${parentWeight.toFixed(1)}%.`,
      );
    }
  }

  return { ok: issues.length === 0, rootTotal, issues };
}

export function formatDraftWeightErrors(v: DraftWeightValidation): string {
  if (v.ok) return "";
  return `[Data tidak valid] ${v.issues.join(" · ")}`;
}
