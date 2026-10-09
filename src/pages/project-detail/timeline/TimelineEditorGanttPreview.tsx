import { Fragment, useMemo } from "react";
import { formatDisplayDate, formatDisplayDateFromMs } from "../../../lib/formatDate";
import { buildGanttTimeScale, ganttLeftPercent } from "./ganttTimeScale";
import { rowDepthByParent } from "./timelineEditorUi";
import type { TimelineEditorRow } from "./types";

const GANTT_DAY_MS = 86400000;

function parseTimelineMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = new Date(raw.slice(0, 10)).getTime();
  return Number.isNaN(t) ? null : t;
}

type Props = {
  rows: TimelineEditorRow[];
  visibleIndices: number[];
  rowRefFn: (row: TimelineEditorRow, index: number) => string;
  parentRefsWithChildren: Set<string>;
  collapsedRefs: Set<string>;
  onToggleCollapse: (ref: string) => void;
  busy?: boolean;
  /** Legend hint on the right (default: sandbox preview). */
  legendNote?: string;
};

export function TimelineEditorGanttPreview({
  rows,
  visibleIndices,
  rowRefFn,
  parentRefsWithChildren,
  collapsedRefs,
  onToggleCollapse,
  busy,
  legendNote = "Preview sandbox (tanpa progress ClickUp)",
}: Props) {
  const sortedIndices = useMemo(
    () =>
      [...visibleIndices].sort(
        (a, b) => (rows[a].sort_order ?? a) - (rows[b].sort_order ?? b),
      ),
    [visibleIndices, rows],
  );

  const range = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows) {
      const s = parseTimelineMs(row.start_date);
      const e = parseTimelineMs(row.target_date);
      if (s == null && e == null) continue;
      const a = s ?? e!;
      const b = e ?? s!;
      min = Math.min(min, a, b);
      max = Math.max(max, a, b);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, span: Math.max(max - min, GANTT_DAY_MS) };
  }, [rows]);

  const timeScale = useMemo(
    () => (range ? buildGanttTimeScale(range.min, range.max, range.span) : null),
    [range],
  );

  if (!rows.length) {
    return (
      <p className="text-muted gantt-empty">Tambah baris jadwal untuk preview timeline.</p>
    );
  }

  if (!range || !timeScale) {
    return (
      <p className="text-muted gantt-empty">
        {busy
          ? "Menghitung jadwal untuk preview…"
          : "Isi tanggal mulai proyek dan pastikan baris punya mulai/selesai (recalc otomatis)."}
      </p>
    );
  }

  const { min, max, span } = range;
  const { trackMinWidthPx, gridLineMs, labeledTicks } = timeScale;
  const fmt = (ms: number) => formatDisplayDateFromMs(ms);
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const showToday = todayMs >= min && todayMs <= max;
  const todayLeft = ((todayMs - min) / span) * 100;

  return (
    <section className="timeline-gantt-pro timeline-editor-gantt" aria-label="Preview timeline">
      <div className="timeline-gantt-pro__toolbar">
        <span className="timeline-gantt-pro__range">
          {fmt(min)} — {fmt(max)}
        </span>
        <div className="timeline-gantt-pro__legend">
          <span>
            <i className="timeline-gantt-pro__swatch timeline-gantt-pro__swatch--phase" /> Phase
          </span>
          <span>
            <i className="timeline-gantt-pro__swatch timeline-gantt-pro__swatch--task" /> Task
          </span>
          <span>
            <i className="timeline-gantt-pro__swatch timeline-gantt-pro__swatch--milestone" />{" "}
            Milestone
          </span>
          <span className="text-muted">{legendNote}</span>
        </div>
      </div>
      <div className="timeline-gantt-pro__scroll">
        <div
          className="timeline-gantt-pro__grid"
          style={{
            gridTemplateColumns: `minmax(12.5rem, 28%) minmax(${trackMinWidthPx}px, 1fr)`,
          }}
        >
          <div className="timeline-gantt-pro__head-corner">Timeline</div>
          <div className="timeline-gantt-pro__head-track">
            {gridLineMs.map((t) => (
              <div
                key={`grid-${t}`}
                className="timeline-gantt-pro__head-gridline"
                style={{ left: `${ganttLeftPercent(t, min, span)}%` }}
                aria-hidden
              />
            ))}
            {labeledTicks.map(({ ms, label }) => (
              <div
                key={`label-${ms}`}
                className="timeline-gantt-pro__tick"
                style={{ left: `${ganttLeftPercent(ms, min, span)}%` }}
                title={fmt(ms)}
              >
                {label}
              </div>
            ))}
            {showToday ? (
              <div
                className="timeline-gantt-pro__today-line"
                style={{ left: `${todayLeft}%` }}
                title="Hari ini"
              />
            ) : null}
          </div>
          {sortedIndices.map((index) => {
            const row = rows[index];
            const startMs = parseTimelineMs(row.start_date);
            const endMs = parseTimelineMs(row.target_date);
            const hasBaseline = startMs != null || endMs != null;
            const s = startMs ?? endMs ?? min;
            const e = endMs ?? startMs ?? s;
            const left = hasBaseline ? ((Math.min(s, e) - min) / span) * 100 : 0;
            const width = hasBaseline
              ? Math.max(((Math.abs(e - s) || GANTT_DAY_MS) / span) * 100, 0.8)
              : 0;
            const kind = (row.item_type ?? "task").toLowerCase();
            const isMilestone = kind === "milestone";
            const depth = rowDepthByParent(row, rows, (r, i) =>
              rowRefFn(r as TimelineEditorRow, i),
            );
            const isChild = kind === "subtask" || (depth >= 2 && kind !== "phase");
            const labelClass =
              kind === "phase"
                ? "timeline-gantt-pro__label timeline-gantt-pro__label--phase"
                : isChild
                  ? "timeline-gantt-pro__label timeline-gantt-pro__label--child"
                  : "timeline-gantt-pro__label timeline-gantt-pro__label--task";
            const tip = `${row.name}\n${formatDisplayDate(row.start_date)} → ${formatDisplayDate(row.target_date)}`;
            const rowKey = rowRefFn(row, index);
            const hasChildren = parentRefsWithChildren.has(rowKey);
            const collapsed = collapsedRefs.has(rowKey);

            return (
              <Fragment key={rowKey}>
                <div
                  className={`${labelClass} timeline-gantt-pro__label-wrap`}
                  style={{ paddingLeft: `${0.35 + depth * 1.05}rem` }}
                  title={tip}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label={collapsed ? "Expand anak" : "Collapse anak"}
                      onClick={() => onToggleCollapse(rowKey)}
                    >
                      {collapsed ? "▸" : "▾"}
                    </button>
                  ) : isChild ? (
                    <span className="timeline-gantt-pro__tree tree-toggle-spacer" aria-hidden />
                  ) : null}
                  <span className="cell-truncate">{row.name || rowKey}</span>
                </div>
                <div className="timeline-gantt-pro__track">
                  {gridLineMs.map((t) => (
                    <div
                      key={`${rowKey}-${t}`}
                      className="timeline-gantt-pro__gridline"
                      style={{ left: `${ganttLeftPercent(t, min, span)}%` }}
                    />
                  ))}
                  {showToday ? (
                    <div
                      className="timeline-gantt-pro__today-line timeline-gantt-pro__today-line--row"
                      style={{ left: `${todayLeft}%` }}
                    />
                  ) : null}
                  {!hasBaseline && !isMilestone ? (
                    <span className="timeline-gantt-pro__no-baseline" title="Belum ada tanggal">
                      —
                    </span>
                  ) : isMilestone && hasBaseline ? (
                    <div
                      className="timeline-gantt-pro__diamond timeline-gantt-pro__diamond--open"
                      style={{ left: `calc(${left + width / 2}% - 6px)` }}
                      title={tip}
                    />
                  ) : hasBaseline ? (
                    <div
                      className={`timeline-gantt-pro__bar-wrap timeline-gantt-pro__bar-wrap--${kind === "subtask" ? "subtask" : kind === "phase" ? "phase" : "task"}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={tip}
                    >
                      <div className="timeline-gantt-pro__bar-bg" />
                      <div className="timeline-gantt-pro__bar-fill" style={{ width: "0%" }} />
                    </div>
                  ) : null}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
