import { formatDisplayDate } from "../../../lib/formatDate";
import { PREDECESSOR_LINK_OPTIONS, normalizePredecessorLinkType } from "../../../predecessorLinkTypes";
import type { TimelineEditorPredecessor, TimelineEditorRow } from "./types";

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

type PredOption = { ref: string; label: string; item_type: string };

type Props = {
  row: TimelineEditorRow;
  depth: number;
  isMilestone: boolean;
  itemType: string;
  predOptions: PredOption[];
  parentOptions: PredOption[];
  onPatch: (patch: Partial<TimelineEditorRow>) => void;
  onPatchPreds: (preds: TimelineEditorPredecessor[]) => void;
  onRemove: () => void;
};

export function TimelineEditorRowCard({
  row,
  depth,
  isMilestone,
  itemType,
  predOptions,
  parentOptions,
  onPatch,
  onPatchPreds,
  onRemove,
}: Props) {
  const options = predOptions.filter(
    (o) => (o.item_type || "").toLowerCase() !== "milestone",
  );

  return (
    <article className={`te-card te-card--${itemType}`}>
      <div className="te-card__grid">
        <div className="te-field te-field--name">
          <span className="te-field__label">Nama</span>
          <div
            className="timeline-editor-name"
            style={{ paddingLeft: depth > 0 ? `${depth * 0.5}rem` : undefined }}
          >
            {depth > 0 ? (
              <span className="timeline-editor-name__tree" aria-hidden>
                └
              </span>
            ) : null}
            <input
              className="te-ctl te-ctl--text"
              value={row.name}
              placeholder="Nama baris"
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          </div>
        </div>

        <div className="te-field te-field--type">
          <span className="te-field__label">Tipe</span>
          <select
            className={`te-ctl te-ctl--type te-ctl--type-${itemType}`}
            value={row.item_type}
            aria-label="Tipe baris"
            onChange={(e) => {
              const t = e.target.value;
              onPatch({
                item_type: t,
                ...(t === "milestone"
                  ? { duration_days: 0, weight_pct: 0, predecessors: [] }
                  : {}),
              });
            }}
          >
            <option value="phase">Phase</option>
            <option value="task">Task</option>
            <option value="subtask">Subtask</option>
            <option value="milestone">Milestone</option>
          </select>
        </div>

        <div className="te-field te-field--parent">
          <span className="te-field__label">Parent</span>
          <select
            className="te-ctl te-ctl--parent"
            value={row.parent_ref ?? ""}
            aria-label="Parent"
            onChange={(e) => onPatch({ parent_ref: e.target.value || null })}
          >
            <option value="">Root</option>
            {parentOptions.map((o) => (
              <option key={o.ref} value={o.ref}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="te-field te-field--dur">
          <span className="te-field__label">Durasi (HK)</span>
          {!isMilestone ? (
            <input
              type="number"
              min={1}
              className="te-ctl te-ctl--num"
              value={row.duration_days}
              onChange={(e) =>
                onPatch({
                  duration_days: Math.max(1, Number(e.target.value) || 1),
                  schedule_driver: "duration",
                })
              }
            />
          ) : (
            <span className="te-ctl te-ctl--static">0</span>
          )}
        </div>

        <div className="te-field te-field--dates">
          <span className="te-field__label">Mulai — selesai</span>
          <div className="timeline-editor-dates">
            {!isMilestone ? (
              <input
                type="date"
                className="te-ctl te-ctl--date"
                value={toDateInput(row.start_date)}
                aria-label="Mulai"
                onChange={(e) =>
                  onPatch({
                    start_date: e.target.value || null,
                    schedule_driver: "start",
                  })
                }
              />
            ) : (
              <span className="te-ctl te-ctl--static te-ctl--date-read">
                {formatDisplayDate(row.start_date)}
              </span>
            )}
            <span className="timeline-editor-dates__sep" aria-hidden>
              —
            </span>
            <input
              type="date"
              className="te-ctl te-ctl--date"
              value={toDateInput(row.target_date)}
              aria-label="Selesai"
              onChange={(e) =>
                onPatch({
                  target_date: e.target.value || null,
                  schedule_driver: isMilestone ? undefined : "end",
                })
              }
            />
          </div>
        </div>

        <div className="te-field te-field--actions">
          <span className="te-field__label te-field__label--sr">Aksi</span>
          <button type="button" className="te-btn te-btn--danger" onClick={onRemove}>
            Hapus baris
          </button>
        </div>
      </div>

      {!isMilestone ? (
        <div className="te-card__pred">
          <div className="te-card__pred-head">
            <span className="te-field__label">Predecessor</span>
            <div className="te-card__pred-tools">
              {options.length > 0 ? (
                <button
                  type="button"
                  className="te-btn te-btn--ghost"
                  onClick={() => {
                    onPatchPreds([
                      ...(row.predecessors ?? []),
                      {
                        predecessor_ref: options[0].ref,
                        link_type: "FS",
                        lag_days: 0,
                      },
                    ]);
                  }}
                >
                  + Tambah
                </button>
              ) : null}
              {(row.predecessors ?? []).length > 0 ? (
                <button
                  type="button"
                  className="te-btn te-btn--ghost te-btn--muted"
                  onClick={() => onPatchPreds([])}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          {(row.predecessors ?? []).length === 0 ? (
            <p className="te-card__pred-empty">Urutan default (tanpa link eksplisit)</p>
          ) : (
            <ul className="te-pred-list">
              {(row.predecessors ?? []).map((p, pi) => (
                <li key={`pred-${pi}`} className="timeline-editor-pred-row">
                  <select
                    className="te-ctl te-ctl--pred-task"
                    value={p.predecessor_ref}
                    aria-label="Task predecessor"
                    onChange={(e) => {
                      const preds = [...(row.predecessors ?? [])];
                      preds[pi] = { ...preds[pi], predecessor_ref: e.target.value };
                      onPatchPreds(preds);
                    }}
                  >
                    {options.map((o) => (
                      <option key={o.ref} value={o.ref}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="te-ctl te-ctl--pred-link"
                    value={normalizePredecessorLinkType(p.link_type)}
                    aria-label="Relasi"
                    title={
                      PREDECESSOR_LINK_OPTIONS.find(
                        (o) => o.value === normalizePredecessorLinkType(p.link_type),
                      )?.hint
                    }
                    onChange={(e) => {
                      const preds = [...(row.predecessors ?? [])];
                      preds[pi] = { ...preds[pi], link_type: e.target.value };
                      onPatchPreds(preds);
                    }}
                  >
                    {PREDECESSOR_LINK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value}
                      </option>
                    ))}
                  </select>
                  <label className="te-pred-lag">
                    <span>Lag</span>
                    <input
                      type="number"
                      min={0}
                      className="te-ctl te-ctl--pred-lag"
                      value={p.lag_days ?? 0}
                      onChange={(e) => {
                        const preds = [...(row.predecessors ?? [])];
                        preds[pi] = {
                          ...preds[pi],
                          lag_days: Math.max(0, Number(e.target.value) || 0),
                        };
                        onPatchPreds(preds);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="te-icon-btn"
                    aria-label="Hapus predecessor"
                    onClick={() => {
                      onPatchPreds((row.predecessors ?? []).filter((_, i) => i !== pi));
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}
