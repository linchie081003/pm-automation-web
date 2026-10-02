import { APP_TIMEZONE } from "./lib/timezone";

/** Finish-to-start predecessor recalc for rebaseline phase rows (calendar days). */

export type RebaselinePhaseRowLike = {
  start_date: string;
  target_date: string;
  lifecycle?: "open" | "in_progress" | "closed";
  milestone_id?: number | null;
  client_key?: string;
  sort_order: number;
  predecessor_ref?: string;
  duration_days?: number;
};

export function phaseRowRef(row: RebaselinePhaseRowLike, fallbackIndex: number): string {
  if (row.milestone_id != null) return `m:${row.milestone_id}`;
  if (row.client_key) return `c:${row.client_key}`;
  return `i:${fallbackIndex}`;
}

function sameRow(a: RebaselinePhaseRowLike, b: RebaselinePhaseRowLike): boolean {
  if (a.milestone_id != null && a.milestone_id === b.milestone_id) return true;
  if (a.client_key && a.client_key === b.client_key) return true;
  return false;
}

function parseIso(s: string): Date | null {
  if (!s || s.length < 10) return null;
  const d = new Date(`${s.slice(0, 10)}T12:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtIso(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addCalendarDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

function inclusiveDurationDays(start: string, target: string): number {
  const a = parseIso(start);
  const b = parseIso(target);
  if (!a || !b) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(diff, 0) + 1;
}

export function recalcPhasesFromPredecessors<T extends RebaselinePhaseRowLike>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const refList = sorted.map((r) => {
    const origIdx = rows.findIndex((x) => sameRow(x, r));
    return phaseRowRef(r, origIdx >= 0 ? origIdx : 0);
  });
  const refToSortedIdx = new Map(refList.map((ref, i) => [ref, i]));

  const working = sorted.map((r) => ({ ...r }));

  for (let i = 0; i < working.length; i++) {
    const row = working[i];
    if (row.lifecycle === "closed") continue;

    const dur =
      row.duration_days && row.duration_days > 0
        ? row.duration_days
        : inclusiveDurationDays(row.start_date, row.target_date);

    let predTarget: string | undefined;
    const predRef = row.predecessor_ref?.trim();
    if (predRef) {
      const pi = refToSortedIdx.get(predRef);
      if (pi != null && pi >= 0 && pi < working.length) {
        predTarget = working[pi].target_date;
      }
    } else if (i > 0) {
      predTarget = working[i - 1].target_date;
    }

    const pt = predTarget ? parseIso(predTarget) : null;
    if (pt) {
      const newStart = addCalendarDays(pt, 1);
      row.start_date = fmtIso(newStart);
      row.target_date = fmtIso(addCalendarDays(newStart, Math.max(dur - 1, 0)));
      row.duration_days = dur;
    } else if (row.start_date && row.target_date) {
      row.duration_days = dur;
    }
  }

  return rows.map((orig) => {
    const w = working.find((x) => sameRow(x, orig));
    return w ? { ...orig, start_date: w.start_date, target_date: w.target_date, duration_days: w.duration_days } : orig;
  });
}
