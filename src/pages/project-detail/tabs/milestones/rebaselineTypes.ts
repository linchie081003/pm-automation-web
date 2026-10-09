export type ProposedPhaseRow = {
  name: string;
  start_date: string;
  target_date: string;
  weight_pct: string;
  milestone_id?: number | null;
  client_key?: string;
  sort_order: number;
  lifecycle?: "open" | "in_progress" | "closed";
  can_delete?: boolean;
  can_edit_weight?: boolean;
  clickup_workflow?: string;
  pdc_status?: string;
  notes?: string;
  predecessor_ref?: string;
  predecessor_link_type?: string;
  duration_days?: number;
};

export type RebaselinePhaseSummary = {
  open_phase_ids: number[];
  in_progress_phase_ids: number[];
  closed_phase_ids: number[];
  adjustable_weights: {
    milestone_id: number;
    name: string;
    weight_pct: number;
    lifecycle: string;
  }[];
};

export function rebaselineLifecycleLabel(row: ProposedPhaseRow): string {
  if (!row.milestone_id) return "Fase baru";
  if (row.lifecycle === "closed" || row.pdc_status === "done") return "Closed (selesai)";
  if (row.lifecycle === "in_progress") return "In progress";
  return "Open";
}

