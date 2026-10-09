export type TimelineItemInput = {
  row_key: string;
  name: string;
  item_type: string;
  weight_pct: number;
  parent_key?: string | null;
  duration_days?: number;
};

const TOL = 0.5;

function normType(raw: string): string {
  return (raw || "phase").trim().toLowerCase();
}

export function validateTimelineItems(items: TimelineItemInput[]): string | null {
  if (!items.length) return "Minimal satu baris item.";
  const nodes = new Map<string, TimelineItemInput & { children: string[] }>();
  for (const it of items) {
    const k = it.row_key.trim();
    if (!k) return "Setiap baris harus punya row_key.";
    if (nodes.has(k)) return `row_key duplikat: ${k}`;
    if (!it.name.trim()) return `Nama kosong untuk key ${k}`;
    nodes.set(k, { ...it, children: [] });
  }
  const roots: string[] = [];
  for (const [k, it] of nodes) {
    const pk = it.parent_key?.trim();
    if (pk && nodes.has(pk)) {
      nodes.get(pk)!.children.push(k);
    } else if (!pk) {
      roots.push(k);
    } else {
      return `parent_key tidak ditemukan: ${pk}`;
    }
  }

  for (const it of nodes.values()) {
    const t = normType(it.item_type);
    const pk = it.parent_key?.trim();
    const parent = pk ? nodes.get(pk) : null;
    if (!parent) {
      if (t === "milestone") {
        return `Milestone gate «${it.name}» harus di bawah phase — isi parent_key (bukan root).`;
      }
      if (t !== "phase") return `Baris root «${it.name}» harus tipe phase.`;
    } else {
      const pt = normType(parent.item_type);
      if (pt === "phase" && t !== "task" && t !== "milestone") {
        return (
          `Di bawah phase «${parent.name}», «${it.name}» bertipe ${t} — ` +
          "hanya task atau milestone gate. Ubah kolom Tipe atau parent."
        );
      }
      if (pt === "task" && t !== "subtask") {
        return (
          `Di bawah task «${parent.name}», «${it.name}» bertipe ${t} — hanya subtask.`
        );
      }
      if (pt !== "phase" && pt !== "task") {
        return `Parent tidak valid untuk «${it.name}».`;
      }
    }
    if (t === "milestone" && Math.abs(it.weight_pct) > TOL) {
      return `Milestone gate «${it.name}» bobot harus 0%.`;
    }
    if (t !== "milestone" && (it.duration_days ?? 1) < 1) {
      return `Durasi «${it.name}» minimal 1 hari.`;
    }
  }

  const phaseRoots = roots.filter((k) => normType(nodes.get(k)!.item_type) === "phase");
  if (!phaseRoots.length) return "Minimal satu phase di root.";
  const rootW = phaseRoots.reduce((s, k) => s + (Number(nodes.get(k)!.weight_pct) || 0), 0);
  if (Math.abs(rootW - 100) > TOL) {
    return `Total bobot phase root ${rootW.toFixed(1)}% — harus 100%.`;
  }

  function checkChildren(key: string): string | null {
    const parent = nodes.get(key)!;
    const pt = normType(parent.item_type);
    if (pt === "milestone") return null;
    const weighted = parent.children.filter((ck) => normType(nodes.get(ck)!.item_type) !== "milestone");
    if (!weighted.length) return null;
    const sum = weighted.reduce((s, ck) => s + (Number(nodes.get(ck)!.weight_pct) || 0), 0);
    if (Math.abs(sum - parent.weight_pct) > TOL) {
      return `Bobot anak «${parent.name}» = ${sum.toFixed(1)}% harus = parent ${parent.weight_pct}%.`;
    }
    for (const ck of parent.children) {
      const err = checkChildren(ck);
      if (err) return err;
    }
    return null;
  }

  for (const k of roots) {
    const err = checkChildren(k);
    if (err) return err;
  }
  return null;
}

export function rootPhaseWeightSum(items: TimelineItemInput[]): number {
  return items
    .filter((it) => !it.parent_key?.trim() && normType(it.item_type) === "phase")
    .reduce((s, it) => s + (Number(it.weight_pct) || 0), 0);
}
