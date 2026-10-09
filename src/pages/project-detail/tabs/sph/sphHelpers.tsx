import { newId } from "../../../../lib/newId";
import { toDateInputValue } from "../../../../lib/formatDate";
import type { DraftTimelineRow } from "../../timeline/draftTypes";
export type PaymentTermRow = {
  label: string;
  due_date: string;
  percent_pct: string;
  draft_milestone_id: string;
  draft_milestone_row_key: string;
};

export function mapPaymentTermsFromApi(
  terms: {
    label?: string;
    due_date?: string | null;
    percent_pct?: number | null;
    draft_milestone_id?: number | null;
    draft_milestone_row_key?: string | null;
  }[],
): PaymentTermRow[] {
  return (terms ?? []).map((t) => ({
    label: t.label ?? "",
    due_date: toDateInputValue(t.due_date),
    percent_pct: t.percent_pct != null ? String(t.percent_pct) : "",
    draft_milestone_id:
      t.draft_milestone_id != null ? String(t.draft_milestone_id) : "",
    draft_milestone_row_key: t.draft_milestone_row_key ?? "",
  }));
}
export type LineItemRow = { id: string; text: string; module?: string };
export type DeliveryItemRow = { id: string; name: string; amount_rupiah: string };

export function SphLineList({
  items,
  setItems,
  placeholder,
  showModule,
}: {
  items: LineItemRow[];
  setItems: (v: LineItemRow[]) => void;
  placeholder: string;
  showModule?: boolean;
}) {
  return (
    <div className="sph-list-panel">
      {items.length === 0 ? (
        <p className="sph-list-empty">Belum ada item. Tambahkan baris scope di bawah.</p>
      ) : showModule ? (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "3rem" }}>#</th>
              <th style={{ width: "10rem" }}>Modul</th>
              <th>Use case / scope</th>
              <th style={{ width: "3rem" }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="text-muted">{index + 1}</td>
                <td>
                  <input
                    className="sph-inline-input"
                    value={item.module ?? ""}
                    placeholder="Modul"
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...next[index], module: e.target.value };
                      setItems(next);
                    }}
                  />
                </td>
                <td>
                  <textarea
                    className="sph-list-text"
                    rows={2}
                    value={item.text}
                    placeholder={placeholder}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...next[index], text: e.target.value };
                      setItems(next);
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-icon-danger"
                    aria-label="Hapus item"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="sph-list-rows">
          {items.map((item, index) => (
            <div key={item.id} className="sph-list-row">
              <span className="sph-list-index">{index + 1}</span>
              <textarea
                className="sph-list-text"
                rows={2}
                value={item.text}
                placeholder={placeholder}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], text: e.target.value };
                  setItems(next);
                }}
              />
              <button
                type="button"
                className="btn-icon-danger"
                title="Hapus item"
                aria-label="Hapus item"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn-add-row"
        onClick={() =>
          setItems([
            ...items,
            { id: newId(), text: "", ...(showModule ? { module: "" } : {}) },
          ])
        }
      >
        + Tambah item
      </button>
    </div>
  );
}

export function syncPaymentTermsFromDraft(
  draft: DraftTimelineRow[],
  terms: PaymentTermRow[],
): PaymentTermRow[] {
  const byId = new Map(
    draft.filter((d) => d.id != null).map((d) => [String(d.id), d]),
  );
  const byKey = new Map(
    draft.filter((d) => d.row_key).map((d) => [String(d.row_key), d]),
  );
  const byName = new Map(
    draft.map((d) => [d.name.trim().toLowerCase(), d]),
  );
  return terms.map((t) => {
    let hit: DraftTimelineRow | undefined;
    if (t.draft_milestone_row_key) hit = byKey.get(t.draft_milestone_row_key);
    if (!hit && t.draft_milestone_id) hit = byId.get(t.draft_milestone_id);
    if (!hit && t.label.trim()) hit = byName.get(t.label.trim().toLowerCase());
    if (!hit?.target_date && !hit?.id) return t;
    return {
      ...t,
      draft_milestone_id: hit.id != null ? String(hit.id) : t.draft_milestone_id,
      draft_milestone_row_key: hit.row_key ?? t.draft_milestone_row_key,
      due_date: hit.target_date ? toDateInputValue(hit.target_date) : t.due_date,
      label: t.label.trim() || hit.name || t.label,
    };
  });
}
