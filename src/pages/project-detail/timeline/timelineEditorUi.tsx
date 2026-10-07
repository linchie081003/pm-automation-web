import type { ReactNode } from "react";

export function TimelineEditorTypePill({ type }: { type: string | undefined }) {
  const t = (type ?? "task").toLowerCase();
  return <span className={`item-type-pill item-type-pill--${t}`}>{t}</span>;
}

export function rowDepthByParent(
  row: { parent_ref?: string | null; row_key?: string | null },
  rows: { parent_ref?: string | null; row_key?: string | null; id?: number | null }[],
  rowRefFn: (r: { parent_ref?: string | null; row_key?: string | null; id?: number | null }, index: number) => string,
): number {
  const byRef = new Map(rows.map((r, i) => [rowRefFn(r, i), r]));
  let depth = 0;
  let cur = row.parent_ref?.trim();
  const seen = new Set<string>();
  while (cur && byRef.has(cur) && depth < 8) {
    if (seen.has(cur)) break;
    seen.add(cur);
    depth += 1;
    cur = byRef.get(cur)?.parent_ref?.trim() || "";
  }
  return depth;
}

export function TimelineEditorEmptyState({ onAdd, onReload }: { onAdd: () => void; onReload: () => void }) {
  return (
    <div className="timeline-editor-empty">
      <p className="timeline-editor-empty__title">Belum ada baris jadwal</p>
      <p className="timeline-editor-empty__desc">
        Muat salinan dari draft tab SPH, atau mulai sandbox dengan phase root baru. Perubahan di
        sini belum disimpan ke SPH.
      </p>
      <div className="timeline-editor-empty__actions">
        <button type="button" className="primary" onClick={onAdd}>
          + Tambah baris pertama
        </button>
        <button type="button" onClick={onReload}>
          Muat dari draft SPH
        </button>
      </div>
    </div>
  );
}

export function TimelineEditorKpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="timeline-editor-kpi">
      <span className="timeline-editor-kpi__label">{label}</span>
      <span className="timeline-editor-kpi__value">{value}</span>
      {sub ? <span className="timeline-editor-kpi__sub">{sub}</span> : null}
    </div>
  );
}
