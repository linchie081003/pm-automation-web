import { PREDECESSOR_LINK_OPTIONS, normalizePredecessorLinkType } from "../../predecessorLinkTypes";
import type { TimelineEditorPredecessor } from "./types";

export type PredOption = { ref: string; label: string; item_type?: string };

type Props = {
  predecessors: TimelineEditorPredecessor[];
  options: PredOption[];
  readOnly?: boolean;
  onChange: (preds: TimelineEditorPredecessor[]) => void;
  className?: string;
};

export function TimelinePredecessorsDetails({
  predecessors,
  options,
  readOnly = false,
  onChange,
  className = "te-pred-details",
}: Props) {
  const taskOptions = options.filter(
    (o) => (o.item_type || "").toLowerCase() !== "milestone",
  );
  const predCount = predecessors.length;

  if (readOnly) {
    if (predCount === 0) return <span className="cell-muted">—</span>;
    return (
      <ul className="te-pred-list te-pred-list--readonly">
        {predecessors.map((p, pi) => {
          const label =
            taskOptions.find((o) => o.ref === p.predecessor_ref)?.label ?? p.predecessor_ref;
          return (
            <li key={pi}>
              {label} ({normalizePredecessorLinkType(p.link_type)}
              {p.lag_days ? ` +${p.lag_days}HK` : ""})
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <details className={className} open={false}>
      <summary className="te-pred-details__summary">
        <span>Predecessor</span>
        {predCount > 0 ? (
          <span className="te-pred-details__badge">{predCount} link</span>
        ) : (
          <span className="te-pred-details__hint">Opsional — urutan default dari grid</span>
        )}
      </summary>
      <div className="te-pred-details__body">
        <div className="te-pred-details__tools">
          {taskOptions.length > 0 ? (
            <button
              type="button"
              className="te-btn te-btn--ghost"
              onClick={() => {
                onChange([
                  ...predecessors,
                  {
                    predecessor_ref: taskOptions[0].ref,
                    link_type: "FS",
                    lag_days: 0,
                  },
                ]);
              }}
            >
              + Tambah link
            </button>
          ) : null}
          {predCount > 0 ? (
            <button
              type="button"
              className="te-btn te-btn--ghost te-btn--muted"
              onClick={() => onChange([])}
            >
              Reset
            </button>
          ) : null}
        </div>
        {predCount === 0 ? (
          <p className="te-card__pred-empty">Belum ada predecessor eksplisit.</p>
        ) : (
          <ul className="te-pred-list te-pred-list--table">
            {predecessors.map((p, pi) => (
              <li key={`pred-${pi}`} className="timeline-editor-pred-row">
                <select
                  className="te-ctl te-ctl--pred-task te-ctl--table"
                  value={p.predecessor_ref}
                  aria-label="Task predecessor"
                  onChange={(e) => {
                    const next = [...predecessors];
                    next[pi] = { ...next[pi], predecessor_ref: e.target.value };
                    onChange(next);
                  }}
                >
                  {taskOptions.map((o) => (
                    <option key={o.ref} value={o.ref}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  className="te-ctl te-ctl--pred-link te-ctl--table"
                  value={normalizePredecessorLinkType(p.link_type)}
                  aria-label="Relasi"
                  onChange={(e) => {
                    const next = [...predecessors];
                    next[pi] = { ...next[pi], link_type: e.target.value };
                    onChange(next);
                  }}
                >
                  {PREDECESSOR_LINK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                    </option>
                  ))}
                </select>
                <label className="te-pred-lag">
                  <span>Lag (HK)</span>
                  <input
                    type="number"
                    min={0}
                    className="te-ctl te-ctl--pred-lag te-ctl--table"
                    value={p.lag_days ?? 0}
                    onChange={(e) => {
                      const next = [...predecessors];
                      next[pi] = {
                        ...next[pi],
                        lag_days: Math.max(0, Number(e.target.value) || 0),
                      };
                      onChange(next);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="te-icon-btn"
                  aria-label="Hapus predecessor"
                  onClick={() => onChange(predecessors.filter((_, i) => i !== pi))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
