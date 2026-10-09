import { formatDisplayDate } from "../../../../lib/formatDate";

export type WeeklyReportPeriodOption = {
  report_date?: string;
  anchor_date: string;
  period_start?: string;
  cut_off_date: string;
};

export function reportDateFromOption(a: WeeklyReportPeriodOption): string {
  return a.report_date ?? a.anchor_date;
}

/** Matches backend display_period_day_count (inclusive calendar days). */
export function displayPeriodDayCount(periodLengthDays: number): number {
  return Math.max(1, periodLengthDays + 1);
}

export function formatWeeklyPeriodOptionLabel(a: WeeklyReportPeriodOption): string {
  const rd = reportDateFromOption(a);
  const ps = a.period_start ?? rd;
  if (a.period_start && a.cut_off_date > rd) {
    return `${formatDisplayDate(ps)} – ${formatDisplayDate(rd)} (cut-off ${formatDisplayDate(a.cut_off_date)})`;
  }
  return `${formatDisplayDate(ps)} – ${formatDisplayDate(rd)}`;
}

export function formatStoredWeeklyPeriod(
  weekStart: string,
  weekEnd: string,
  periodStart?: string | null,
): string {
  if (weekEnd > weekStart && (!periodStart || periodStart === weekStart)) {
    return `${formatDisplayDate(weekStart)} s/d ${formatDisplayDate(weekEnd)}`;
  }
  const ps = periodStart ?? weekStart;
  const rd = weekEnd >= weekStart ? weekEnd : weekStart;
  return `${formatDisplayDate(ps)} – ${formatDisplayDate(rd)}`;
}

export function isFutureReportDate(reportDate: string, activeReportDate: string | null): boolean {
  if (!reportDate || !activeReportDate) return false;
  return reportDate > activeReportDate;
}

export function isPastReportDate(reportDate: string, activeReportDate: string | null): boolean {
  if (!reportDate || !activeReportDate) return false;
  return reportDate < activeReportDate;
}

export type ReportPeriodStatus = "active" | "past" | "future";

export function reportPeriodStatus(
  reportDate: string,
  activeReportDate: string | null,
): ReportPeriodStatus {
  if (!activeReportDate) return "past";
  if (reportDate > activeReportDate) return "future";
  if (reportDate === activeReportDate) return "active";
  return "past";
}

export function canUseWeeklyReportActions(status: ReportPeriodStatus): boolean {
  return status !== "future";
}

export function reportPeriodStatusLabel(status: ReportPeriodStatus): string {
  if (status === "active") return "Aktif";
  if (status === "past") return "Selesai";
  return "Mendatang";
}

export function spiTone(spi: number): "ok" | "warn" | "bad" {
  if (spi >= 1) return "ok";
  if (spi >= 0.9) return "warn";
  return "bad";
}

export function weeklyPreviewMetricsLabel(source?: string): string {
  switch (source) {
    case "saved_report":
      return "Laporan tersimpan (frozen)";
    case "snapshot":
      return "Snapshot progress periode";
    case "active_live":
      return "Live — selaras health proyek (hari ini)";
    case "computed_historical":
      return "Dihitung ulang periode historis";
    default:
      return "Progress periode";
  }
}

