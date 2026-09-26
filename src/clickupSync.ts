import { api } from "./api";

export type ClickUpSyncResult = {
  synced: number;
  removed_cache?: number;
  unlinked_milestones?: number;
  relinked_milestones?: number;
  inherited_dates?: number;
  timeline_dates_updated?: number;
};

export function formatClickUpSyncMessage(r: ClickUpSyncResult): string {
  const parts = [`${r.synced} task disinkronkan`];
  if (r.inherited_dates) {
    parts.push(`${r.inherited_dates} subtask dapat tanggal dari parent`);
  }
  if (r.timeline_dates_updated) {
    parts.push(`${r.timeline_dates_updated} baris timeline (mulai/selesai) disesuaikan`);
  }
  if (r.relinked_milestones) {
    parts.push(`${r.relinked_milestones} baris timeline terhubung ke ClickUp`);
  }
  if (r.removed_cache) {
    parts.push(`${r.removed_cache} dihapus dari daftar Task`);
  }
  if (r.unlinked_milestones) {
    parts.push(`${r.unlinked_milestones} link timeline dilepas`);
  }
  return `Sync ClickUp OK — ${parts.join(" · ")}. Progress proyek mengikuti hasil sync.`;
}

export async function syncClickUpProgress(projectId: number): Promise<ClickUpSyncResult> {
  return api<ClickUpSyncResult>(`/projects/${projectId}/tasks/sync`, { method: "POST" });
}
