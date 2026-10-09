import { formatDisplayDate } from "../../../../lib/formatDate";
import { TruncatedText } from "../../../../components/TruncatedText";
import { ProgressBar, WorkflowStatusBadge, itemTypePill } from "../../shared/milestoneDisplay";
export type TaskRecapRow = {
  clickup_task_id?: string;
  parent_clickup_task_id?: string | null;
  name: string;
  status: string;
  status_raw?: string | null;
  due_date: string | null;
  is_closed: boolean;
  url?: string | null;
  percent_complete?: number | null;
  phase_name?: string | null;
  phase_status?: string | null;
  item_type?: string;
  depth?: number;
};

export type TaskRecapGroup = {
  list_id: string;
  list_name: string;
  sort_order?: number;
  phase_status?: string | null;
  phase_progress_pct?: number | null;
  tasks: TaskRecapRow[];
};

export function taskRecapRowTooltip(t: TaskRecapRow): string {
  const parts = [t.name];
  if (t.item_type) parts.push(`Tipe: ${t.item_type}`);
  if (t.status) {
    parts.push(
      t.status_raw && t.status_raw !== t.status
        ? `Status: ${t.status} (ClickUp: ${t.status_raw})`
        : `Status: ${t.status}`,
    );
  }
  if (t.percent_complete != null) parts.push(`Progress: ${t.percent_complete}%`);
  if (t.due_date) parts.push(`Due: ${formatDisplayDate(t.due_date)}`);
  if (t.is_closed) parts.push("Closed: Ya");
  return parts.join("\n");
}

export function TaskRecapTables({
  groups,
  tasks,
  compact = true,
}: {
  groups?: TaskRecapGroup[];
  tasks: TaskRecapRow[];
  /** Task & ClickUp — grid rapat; timeline memakai tabel detail terpisah. */
  compact?: boolean;
}) {
  const sections =
    groups && groups.length > 0
      ? groups
      : [{ list_id: "", list_name: "Semua task", tasks: tasks }];
  return (
    <div
      className={`task-recap-unified card task-recap-card${compact ? " task-recap-unified--compact" : ""}`}
    >
      <div className="task-recap-grid task-recap-grid--head" role="row">
        <span>Nama</span>
        <span>Tipe</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Due</span>
        <span>Closed</span>
      </div>
      {sections.map((g) => (
        <section key={g.list_id || g.list_name} className="task-recap-block">
          <div className="task-recap-grid task-recap-grid--phase">
            <div className="task-recap-phase-title">
              <h3 className="task-recap-group__title">
                <TruncatedText text={g.list_name} title={`List: ${g.list_name}`} />
              </h3>
              {g.phase_status && (
                <span
                  className={`phase-status phase-status--${g.phase_status.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {g.phase_status}
                </span>
              )}
            </div>
            <span />
            <span />
            <div className="task-recap-phase-progress">
              {g.phase_progress_pct != null ? (
                <ProgressBar pct={g.phase_progress_pct} />
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
            <span />
            <span />
          </div>
          {g.tasks.length === 0 ? (
            <p className="text-muted task-recap-empty">Tidak ada task di list ini.</p>
          ) : (
            g.tasks.map((t) => (
              <div
                key={t.clickup_task_id ?? `${g.list_id}-${t.name}`}
                className={`task-recap-grid task-recap-grid--row${(t.depth ?? 0) > 0 ? " task-recap-row--child" : ""}`}
                role="row"
              >
                <div
                  className="task-recap-name cell-truncate-wrap"
                  style={{ paddingLeft: `${0.35 + (t.depth ?? 0) * 1.05}rem` }}
                >
                  {(t.depth ?? 0) > 0 && <span className="task-recap-tree" aria-hidden />}
                  <TruncatedText
                    text={t.name}
                    title={taskRecapRowTooltip(t)}
                    href={t.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  />
                </div>
                <div>{itemTypePill(t.item_type)}</div>
                <div>
                  <WorkflowStatusBadge status={t.status} raw={t.status_raw} href={t.url} />
                </div>
                <div>
                  <ProgressBar pct={t.percent_complete} />
                </div>
                <div className="task-recap-due">{formatDisplayDate(t.due_date)}</div>
                <div>{t.is_closed ? "Ya" : "Tidak"}</div>
              </div>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
