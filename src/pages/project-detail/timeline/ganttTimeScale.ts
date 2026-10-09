import { formatDisplayDateFromMs } from "../../../lib/formatDate";

const DAY_MS = 86400000;

export function startOfWeekMs(ms: number): number {
  const d = new Date(ms);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonthMs(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addMonthsClamped(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

/** Compact header label (dd/MM). */
export function formatGanttTickDayMonth(ms: number): string {
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** Compact header label for long ranges. */
export function formatGanttTickMonthYear(ms: number): string {
  const d = new Date(ms);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export type GanttLabeledTick = { ms: number; label: string };

export type GanttTimeScale = {
  /** Min width of the date track (px) — enables horizontal scroll when needed. */
  trackMinWidthPx: number;
  /** Vertical grid lines in row tracks. */
  gridLineMs: number[];
  /** Subset of grid lines with readable header labels. */
  labeledTicks: GanttLabeledTick[];
};

const MIN_PX_PER_WEEK = 56;
const MIN_TRACK_PX = 640;
const TARGET_LABEL_PX = 76;

function buildMsSeries(
  min: number,
  max: number,
  startFn: (ms: number) => number,
  stepFn: (cursor: number) => number,
): number[] {
  const out: number[] = [];
  let cur = startFn(min);
  const guard = 500;
  let n = 0;
  while (cur <= max + DAY_MS && n < guard) {
    if (cur >= min - DAY_MS) out.push(cur);
    cur = stepFn(cur);
    n += 1;
  }
  return out;
}

function pickLabelFormat(spanWeeks: number): (ms: number) => string {
  if (spanWeeks > 40) return formatGanttTickMonthYear;
  if (spanWeeks > 10) return formatGanttTickDayMonth;
  return formatDisplayDateFromMs;
}

function subsampleLabels(
  gridLineMs: number[],
  format: (ms: number) => string,
  trackMinWidthPx: number,
): GanttLabeledTick[] {
  if (!gridLineMs.length) return [];
  const target = Math.min(
    16,
    Math.max(5, Math.floor(trackMinWidthPx / TARGET_LABEL_PX)),
  );
  const step = Math.max(1, Math.ceil(gridLineMs.length / target));
  const picked: GanttLabeledTick[] = [];
  for (let i = 0; i < gridLineMs.length; i += step) {
    const ms = gridLineMs[i];
    picked.push({ ms, label: format(ms) });
  }
  const lastMs = gridLineMs[gridLineMs.length - 1];
  if (picked.length === 0 || picked[picked.length - 1].ms !== lastMs) {
    picked.push({ ms: lastMs, label: format(lastMs) });
  }
  return picked;
}

/** Build grid + header labels for TimelineEditorGanttPreview (all Gantt instances). */
export function buildGanttTimeScale(min: number, max: number, span: number): GanttTimeScale {
  const spanWeeks = Math.max(1, span / (7 * DAY_MS));
  const trackMinWidthPx = Math.max(MIN_TRACK_PX, Math.ceil(spanWeeks) * MIN_PX_PER_WEEK);
  const format = pickLabelFormat(spanWeeks);

  let gridLineMs: number[];
  if (spanWeeks > 52) {
    gridLineMs = buildMsSeries(min, max, startOfMonthMs, (c) => addMonthsClamped(c, 1));
  } else if (spanWeeks > 28) {
    gridLineMs = buildMsSeries(min, max, startOfWeekMs, (c) => c + 14 * DAY_MS);
  } else {
    gridLineMs = buildMsSeries(min, max, startOfWeekMs, (c) => c + 7 * DAY_MS);
  }

  const labeledTicks = subsampleLabels(gridLineMs, format, trackMinWidthPx);

  return { trackMinWidthPx, gridLineMs, labeledTicks };
}

export function ganttLeftPercent(ms: number, min: number, span: number): number {
  return ((ms - min) / span) * 100;
}
