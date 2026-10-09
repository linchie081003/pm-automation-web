export type TimelineEditorPredecessor = {
  predecessor_ref: string;
  link_type: string;
  lag_days: number;
};

export type TimelineEditorLiveMeta = {
  milestone_id?: number;
  module?: string | null;
  status?: string;
  clickup_task_id?: string | null;
  clickup_name?: string | null;
  clickup_status?: string | null;
  clickup_status_raw?: string | null;
  clickup_url?: string | null;
  clickup_due_date?: string | null;
  clickup_progress_pct?: number | null;
  clickup_only?: boolean;
  is_payment_milestone?: boolean;
  schedule_anomalies?: string[];
  depth?: number;
  phase_id?: number | null;
  phase_status?: string | null;
  expandable?: boolean;
  parent_clickup_task_id?: string | null;
  /** Fase done / closed — bobot & tanggal terkunci (EVM). */
  evm_locked?: boolean;
};

export type TimelineEditorRow = {
  id?: number | null;
  row_key?: string | null;
  name: string;
  duration_days: number;
  weight_pct: number;
  item_type: string;
  parent_ref?: string | null;
  parent_id?: number | null;
  sort_order: number;
  start_date?: string | null;
  target_date?: string | null;
  predecessor_ref?: string | null;
  predecessor_link_type?: string | null;
  schedule_driver?: "duration" | "start" | "end" | "milestone" | null;
  predecessors: TimelineEditorPredecessor[];
  /** SPH draft row notes (editable, not stored on live milestones). */
  notes?: string | null;
  /** Set when row represents live milestone (Timeline tab). */
  live?: TimelineEditorLiveMeta;
};

export type TimelineEditorRowLock = { locked: boolean; reason?: string };

export type TimelineEditorSnapshot = {
  project_id: number;
  start_date: string | null;
  rows: TimelineEditorRow[];
  draft_timeline_writable?: boolean;
  save_block_reason?: string | null;
  storage_source?: string;
  sph_draft_writable?: boolean;
  read_only_source: string;
  workspace_updated_at?: string | null;
  note: string;
};
