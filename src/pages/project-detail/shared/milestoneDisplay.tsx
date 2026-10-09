export function ProgressBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null || Number.isNaN(pct)) {
    return <span className="text-muted">—</span>;
  }
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <div className="inline-progress" title={`${v}%`}>
      <div className="inline-progress__track">
        <div className="inline-progress__fill" style={{ width: `${v}%` }} />
      </div>
      <span className="inline-progress__label">{v}%</span>
    </div>
  );
}

function workflowStatusClass(status: string | null | undefined): string {
  const key = (status ?? "todo").replace(/\s+/g, "-").toLowerCase();
  if (key === "completed" || key === "complete" || key === "done") {
    return "workflow-status--done";
  }
  if (key === "in-progress" || key === "in_progress") {
    return "workflow-status--in-progress";
  }
  if (key === "not-started") {
    return "workflow-status--todo";
  }
  return `workflow-status--${key}`;
}

export function WorkflowStatusBadge({
  status,
  raw,
  href,
}: {
  status: string | null | undefined;
  raw?: string | null;
  href?: string | null;
}) {
  if (!status) return <span className="text-muted">—</span>;
  const title = raw && raw !== status ? `ClickUp: ${raw}` : undefined;
  const inner = <span className={`workflow-status ${workflowStatusClass(status)}`}>{status}</span>;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={title}>
        {inner}
      </a>
    );
  }
  return title ? <span title={title}>{inner}</span> : inner;
}

export function itemTypePill(type: string | undefined) {
  const t = type ?? "task";
  return <span className={`item-type-pill item-type-pill--${t}`}>{t}</span>;
}
