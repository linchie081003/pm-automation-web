/** Ringkasan durasi proyek dari draft timeline (sesuai respons API). */

export type ProjectTimelineSummary = {
  project_start_date: string | null;
  project_end_date: string | null;
  project_duration_business_days: number | null;
};

export function formatProjectTimelineSummary(
  summary: ProjectTimelineSummary | null | undefined,
): string | null {
  if (!summary?.project_duration_business_days) return null;
  const days = summary.project_duration_business_days;
  const start = summary.project_start_date?.slice(0, 10);
  const end = summary.project_end_date?.slice(0, 10);
  if (start && end) {
    return `${days} hari kerja (${start} → ${end})`;
  }
  return `${days} hari kerja`;
}
