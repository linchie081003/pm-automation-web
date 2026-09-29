import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";
import { RequirePerm } from "../auth";
import {
  RebaselineDiffView,
  type RebaselineDiffPayload,
} from "../components/RebaselineDiffView";

type PendingRebaseline = {
  id: number;
  project_id: number;
  project_code: string;
  reason: string;
  status: string;
  client_acknowledged: boolean;
  created_at: string;
  proposed_changes: RebaselineDiffPayload;
};

export default function RebaselineApprovalsPage() {
  const [items, setItems] = useState<PendingRebaseline[]>([]);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    const next = await api<PendingRebaseline[]>("/rebaseline/pending");
    setItems(next);
  }, []);

  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
  }, [load]);

  const decide = async (item: PendingRebaseline, approve: boolean) => {
    setMsg("");
    try {
      await api(`/projects/${item.project_id}/rebaseline/requests/${item.id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          approve,
          comment: approve ? "Approved" : "Rejected",
        }),
      });
      await load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  return (
    <RequirePerm perm="rebaseline.approve">
      <h1 className="page-title">Approval Rebaseline</h1>
      {msg && <p className="error">{msg}</p>}
      <div className="card">
        {items.length === 0 && <p className="text-muted">Tidak ada pengajuan rebaseline pending.</p>}
        {items.map((item) => (
          <article key={item.id} className="rebaseline-approval-item" style={{ marginBottom: "1.5rem" }}>
            <header className="btn-group" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <strong>
                <Link to={`/projects/${item.project_id}`}>{item.project_code}</Link>
              </strong>
              <span className="text-muted">#{item.id}</span>
              {!item.client_acknowledged && (
                <span className="notice notice-warning">Menunggu ack klien</span>
              )}
              <button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                {expanded === item.id ? "Sembunyikan diff" : "Lihat diff"}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!item.client_acknowledged}
                onClick={() => decide(item, true)}
              >
                Approve
              </button>
              <button type="button" onClick={() => decide(item, false)}>
                Reject
              </button>
            </header>
            <p>{item.reason}</p>
            {expanded === item.id && <RebaselineDiffView payload={item.proposed_changes} />}
          </article>
        ))}
      </div>
    </RequirePerm>
  );
}
