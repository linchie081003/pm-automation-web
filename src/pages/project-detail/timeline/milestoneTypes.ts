/** Live milestone row from GET /projects/{id}/milestones (merged PDC + ClickUp). */
export type MilestoneRow = {
  id: number;
  name: string;
  module?: string | null;
  start_date: string | null;
  target_date: string | null;
  weight_pct: number;
  status: string;
  is_payment_milestone?: boolean;
  parent_id?: number | null;
  item_type?: string;
  duration_days?: number | null;
  sort_order?: number;
  clickup_task_id?: string | null;
  clickup_name?: string | null;
  clickup_status?: string | null;
  clickup_status_raw?: string | null;
  clickup_url?: string | null;
  clickup_due_date?: string | null;
  clickup_progress_pct?: number | null;
  display_start?: string | null;
  display_end?: string | null;
  display_duration_days?: number | null;
  clickup_only?: boolean;
  phase_id?: number | null;
  expandable?: boolean;
  parent_clickup_task_id?: string | null;
  depth?: number;
  timeline_seq?: number;
  phase_status?: string | null;
  schedule_anomalies?: string[];
  live_predecessors?: {
    predecessor_ref: string;
    link_type: string;
    lag_days: number;
    predecessor_name?: string | null;
  }[];
};
