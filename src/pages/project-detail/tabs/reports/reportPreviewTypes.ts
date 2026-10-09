
export type WeeklyPreview = {
  week_start: string;
  week_end: string;
  report_date?: string;
  cut_off_date?: string;
  status_date_report?: string;
  period_start?: string;
  period_length_days?: number;
  period_day_count?: number;
  target_week_start?: string;
  generate_progress_pct?: number;
  already_exists: boolean;
  existing_report_id?: number | null;
  metrics_source?: string;
  matches_project_health?: boolean;
  next_document_version?: number;
  project_code: string;
  project_name: string;
  baseline_version: number | null;
  planned_pct: number;
  actual_pct: number;
  spi: number;
  deviation_pct?: number;
  deviation_pp?: number;
  gap_pp?: number;
  rag_gap?: string | null;
  rag_schedule?: string | null;
  rag_deviation?: string | null;
  phases_current_week?: {
    name: string;
    start_date: string | null;
    target_date: string | null;
    planned_pct: number;
    actual_pct: number;
  }[];
  phases_next_week?: {
    name: string;
    start_date: string | null;
    target_date: string | null;
    planned_pct: number;
    actual_pct: number;
  }[];
  use_phase_fallback?: boolean;
  use_phase_next_fallback?: boolean;
  phase_gaps?: {
    name: string;
    planned_pct: number;
    actual_pct: number;
    gap_pp: number;
  }[];
  tasks_completed?: { name: string; status: string; due_date: string | null }[];
  tasks_next_week?: { name: string; status: string; due_date: string | null }[];
  next_period_start?: string;
  next_period_end?: string;
  highlights_draft?: string;
  health?: { status_date?: string | null };
  rag_overall: string;
  milestone_count: number;
  task_count: number;
  milestones_preview: { name: string; status: string; target_date: string }[];
  tasks_preview: { name: string; status: string; due_date: string | null }[];
  output_formats: string[];
  notes: string;
};

export function formatDeviationPct(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${Number(v).toFixed(2)}%`;
}

export function ragDisplayLabel(rag: string | null | undefined): string {
  if (!rag) return "—";
  const m: Record<string, string> = { green: "Green", yellow: "Yellow", red: "Red" };
  return m[rag.toLowerCase()] ?? rag;
}
