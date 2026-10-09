import { useEffect, useState } from "react";
import { api, downloadFile, getErrorMessage } from "../../../api";
import { formatClickUpSyncMessage, syncClickUpProgress } from "../../../clickupSync";
import { TabAlert } from "../shared/TabLayout";
import { TaskRecapTables } from "./milestones/taskRecap";
import type { TaskRecapGroup, TaskRecapRow } from "./milestones/taskRecap";
export function EvaluationTab({ projectId }: { projectId: number }) {
  const [rows, setRows] = useState<
    { sph_planned_md: number; actual_md: number; variance_md: number; variance_cost: number }[]
  >([]);
  const [recap, setRecap] = useState<{
    total: number;
    closed: number;
    open: number;
    overdue: number;
    tasks: TaskRecapRow[];
    groups?: TaskRecapGroup[];
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const loadEval = () => api<typeof rows>(`/projects/${projectId}/evaluations`).then(setRows);
  const loadTasks = () =>
    api<typeof recap>(`/projects/${projectId}/tasks/recap`)
      .then(setRecap)
      .catch(() => setRecap(null));
  useEffect(() => {
    loadEval();
    loadTasks();
  }, [projectId]);
  const compute = async () => {
    await api(`/projects/${projectId}/evaluations/compute`, { method: "POST" });
    loadEval();
  };
  const syncClickUp = async () => {
    setMsg("");
    setSyncBusy(true);
    try {
      const r = await syncClickUpProgress(projectId);
      setMsg(formatClickUpSyncMessage(r));
      loadTasks();
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setSyncBusy(false);
    }
  };
  return (
    <div className="card">
      <h2 className="card-title">Task (ClickUp)</h2>
      <p className="text-muted">
        Detail task dari ClickUp; sync memperbarui cache dan progress actual proyek.
      </p>
      <TabAlert message={msg} />
      <div className="btn-group">
        <button type="button" className="primary" disabled={syncBusy} onClick={syncClickUp}>
          {syncBusy ? "Sync…" : "Sync dari ClickUp"}
        </button>
        <button type="button" onClick={compute}>
          Hitung MD (evaluasi)
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => downloadFile(`/projects/${projectId}/tasks/export`)}
        >
          Export task
        </button>
      </div>
      {syncBusy && (
        <div className="sync-progress-bar" role="progressbar" aria-busy="true" aria-label="Sinkronisasi ClickUp">
          <div className="sync-progress-bar__indeterminate" />
        </div>
      )}
      {recap && (
        <p className="text-muted">
          Total: {recap.total} · Open: {recap.open} · Closed: {recap.closed} · Overdue:{" "}
          {recap.overdue}
        </p>
      )}
      {recap && recap.tasks.length > 0 ? (
        <TaskRecapTables groups={recap.groups} tasks={recap.tasks} />
      ) : (
        <p className="text-muted">Belum ada task — aktifkan ClickUp dan Project Start / sync.</p>
      )}
      {rows[0] && (
        <p style={{ marginTop: "1rem" }}>
          Planned MD: {rows[0].sph_planned_md} · Actual: {rows[0].actual_md} · Var MD:{" "}
          {rows[0].variance_md}
        </p>
      )}
    </div>
  );
}

