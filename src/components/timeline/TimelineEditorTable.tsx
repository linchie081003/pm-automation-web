import { Fragment } from "react";
import { formatDisplayDate } from "../../lib/formatDate";
import type { TimelineEditorPredecessor, TimelineEditorRow } from "./types";
import { TimelinePredecessorsDetails, type PredOption } from "./TimelinePredecessorsDetails";

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

type ItemProps = {
  row: TimelineEditorRow;
  index: number;
  depth: number;
  isMilestone: boolean;
  itemType: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  predOptions: PredOption[];
  parentOptions: PredOption[];
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPatch: (patch: Partial<TimelineEditorRow>) => void;
  onPatchPreds: (preds: TimelineEditorPredecessor[]) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAddAfter: () => void;
  onAddPhaseAfterBlock: () => void;
};

function TimelineEditorItemRows({
  row,
  index,
  depth,
  isMilestone,
  itemType,
  canMoveUp,
  canMoveDown,
  predOptions,
  parentOptions,
  hasChildren,
  collapsed,
  onToggleCollapse,
  onPatch,
  onPatchPreds,
  onMove,
  onRemove,
  onAddAfter,
  onAddPhaseAfterBlock,
}: ItemProps) {
  const options = predOptions.filter(
    (o) => (o.item_type || "").toLowerCase() !== "milestone",
  );
  const predCount = row.predecessors?.length ?? 0;
  const colSpan = 9;

  return (
    <Fragment>
      <tr className={`te-table__row te-table__row--${itemType}`}>
        <td className="te-table__col-order">
          <div className="te-order">
            <span className="te-order__num" title="Urutan baris">
              {index + 1}
            </span>
            <div className="te-order__btns">
              <button
                type="button"
                className="te-order-btn"
                title="Naikkan"
                aria-label="Naikkan baris"
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="te-order-btn"
                title="Turunkan"
                aria-label="Turunkan baris"
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
              >
                ↓
              </button>
            </div>
          </div>
        </td>
        <td className="te-table__col-name">
          <div
            className="timeline-editor-name"
            style={{ paddingLeft: depth > 0 ? `${depth * 0.65}rem` : undefined }}
          >
            {hasChildren ? (
              <button
                type="button"
                className="tree-toggle te-tree-toggle"
                aria-label={collapsed ? "Expand anak" : "Collapse anak"}
                onClick={onToggleCollapse}
              >
                {collapsed ? "▸" : "▾"}
              </button>
            ) : depth > 0 ? (
              <span className="timeline-editor-name__tree" aria-hidden>
                └
              </span>
            ) : null}
            <input
              className="te-ctl te-ctl--text te-ctl--table"
              value={row.name}
              placeholder="Nama baris"
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          </div>
        </td>
        <td className="te-table__col-type">
          <select
            className={`te-ctl te-ctl--type te-ctl--table te-ctl--type-${itemType}`}
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
        </td>
        <td className="te-table__col-parent">
          <select
            className="te-ctl te-ctl--parent te-ctl--table"
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
        </td>
        <td className="te-table__col-dur">
          {!isMilestone ? (
            <input
              type="number"
              min={1}
              className="te-ctl te-ctl--num te-ctl--table"
              aria-label="Durasi hari kerja"
              value={row.duration_days}
              onChange={(e) =>
                onPatch({
                  duration_days: Math.max(1, Number(e.target.value) || 1),
                  schedule_driver: "duration",
                })
              }
            />
          ) : (
            <span className="te-cell-muted">0</span>
          )}
        </td>
        <td className="te-table__col-weight">
          {!isMilestone ? (
            <input
              type="number"
              min={0}
              step={0.1}
              className="te-ctl te-ctl--num te-ctl--table"
              aria-label="Bobot persen"
              value={row.weight_pct}
              onChange={(e) =>
                onPatch({ weight_pct: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          ) : (
            <span className="te-cell-muted">0</span>
          )}
        </td>
        <td className="te-table__col-date">
          {!isMilestone ? (
            <input
              type="date"
              className="te-ctl te-ctl--date te-ctl--table te-ctl--date-single"
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
            <span className="te-cell-muted">{formatDisplayDate(row.start_date)}</span>
          )}
        </td>
        <td className="te-table__col-date">
          <input
            type="date"
            className="te-ctl te-ctl--date te-ctl--table te-ctl--date-single"
            value={toDateInput(row.target_date)}
            aria-label="Selesai"
            onChange={(e) =>
              onPatch({
                target_date: e.target.value || null,
                schedule_driver: isMilestone ? "milestone" : "end",
              })
            }
          />
        </td>
        <td className="te-table__col-action">
          <div className="te-action-stack">
            <button
              type="button"
              className="te-btn te-btn--add te-btn--compact"
              title="Task/barir di bawah baris ini (dalam fase)"
              onClick={onAddAfter}
            >
              + Baris
            </button>
            <button
              type="button"
              className="te-btn te-btn--phase te-btn--compact"
              title="Phase root baru setelah blok fase ini (antara fase)"
              onClick={onAddPhaseAfterBlock}
            >
              + Antara fase
            </button>
            <button type="button" className="te-btn te-btn--danger te-btn--compact" onClick={onRemove}>
              Hapus
            </button>
          </div>
        </td>
      </tr>

      {!isMilestone ? (
        <tr className="te-table__row te-table__row--pred">
          <td colSpan={colSpan} className="te-table__pred-cell">
            <TimelinePredecessorsDetails
              predecessors={row.predecessors ?? []}
              options={options}
              onChange={onPatchPreds}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export type TimelineEditorTableProps = {
  rows: TimelineEditorRow[];
  visibleIndices: number[];
  rowRefFn: (row: TimelineEditorRow, index: number) => string;
  depthFn: (row: TimelineEditorRow) => number;
  parentRefsWithChildren: Set<string>;
  collapsedRefs: Set<string>;
  onToggleCollapse: (ref: string) => void;
  predOptions: PredOption[];
  onPatch: (index: number, patch: Partial<TimelineEditorRow>) => void;
  onPatchPreds: (index: number, preds: TimelineEditorPredecessor[]) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAddAfter: (index: number) => void;
  onAddPhaseAfterBlock: (index: number) => void;
};

export function TimelineEditorTable({
  rows,
  visibleIndices,
  rowRefFn,
  depthFn,
  parentRefsWithChildren,
  collapsedRefs,
  onToggleCollapse,
  predOptions,
  onPatch,
  onPatchPreds,
  onMove,
  onRemove,
  onAddAfter,
  onAddPhaseAfterBlock,
}: TimelineEditorTableProps) {
  return (
    <div className="table-scroll te-table-scroll">
      <table className="data-table te-table">
        <colgroup>
          <col className="te-col-order" />
          <col className="te-col-name" />
          <col className="te-col-type" />
          <col className="te-col-parent" />
          <col className="te-col-dur" />
          <col className="te-col-weight" />
          <col className="te-col-date" />
          <col className="te-col-date" />
          <col className="te-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Urut</th>
            <th scope="col">Nama</th>
            <th scope="col">Tipe</th>
            <th scope="col">Parent</th>
            <th scope="col">Durasi (HK)</th>
            <th scope="col">Bobot %</th>
            <th scope="col">Mulai</th>
            <th scope="col">Selesai</th>
            <th scope="col">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {visibleIndices.map((index) => {
            const row = rows[index];
            const selfRef = rowRefFn(row, index);
            const isMilestone = (row.item_type || "").toLowerCase() === "milestone";
            const itemType = (row.item_type || "task").toLowerCase();
            const hasChildren = parentRefsWithChildren.has(selfRef);
            const collapsed = collapsedRefs.has(selfRef);
            return (
              <TimelineEditorItemRows
                key={selfRef}
                row={row}
                index={index}
                depth={depthFn(row)}
                isMilestone={isMilestone}
                itemType={itemType}
                canMoveUp={index > 0}
                canMoveDown={index < rows.length - 1}
                predOptions={predOptions.filter((o) => o.ref !== selfRef)}
                parentOptions={predOptions.filter((o) => o.ref !== selfRef)}
                hasChildren={hasChildren}
                collapsed={collapsed}
                onToggleCollapse={() => onToggleCollapse(selfRef)}
                onPatch={(patch) => onPatch(index, patch)}
                onPatchPreds={(preds) => onPatchPreds(index, preds)}
                onMove={(dir) => onMove(index, dir)}
                onRemove={() => onRemove(index)}
                onAddAfter={() => onAddAfter(index)}
                onAddPhaseAfterBlock={() => onAddPhaseAfterBlock(index)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
