export type TimelineEditorPredecessor = {
  predecessor_ref: string;
  link_type: string;
  lag_days: number;
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
  schedule_driver?: "duration" | "start" | "end" | null;
  predecessors: TimelineEditorPredecessor[];
};

export type TimelineEditorSnapshot = {
  project_id: number;
  start_date: string | null;
  rows: TimelineEditorRow[];
  read_only_source: string;
  note: string;
};
