import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { formatDisplayDateTime } from "../../../lib/formatDate";
import { TabAlert } from "../shared/TabLayout";
export type AuditLogRow = {
  id: number;
  action: string;
  action_label: string;
  detail: Record<string, unknown>;
  created_at: string | null;
  user_name: string | null;
  user_email: string | null;
};

export function formatAuditDetail(detail: Record<string, unknown>): string {
  const keys = Object.keys(detail);
  if (!keys.length) return "—";
  return keys
    .map((k) => {
      const v = detail[k];
      if (v == null || v === "") return null;
      return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .filter(Boolean)
    .join(" · ");
}

export function AuditTrailTab({
  projectId,
  refreshKey,
}: {
  projectId: number;
  refreshKey: number;
}) {
  const [items, setItems] = useState<AuditLogRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setErr("");
    api<{ items: AuditLogRow[] }>(`/projects/${projectId}/activity-log`)
      .then((r) => setItems(r.items ?? []))
      .catch((e) => {
        setErr(getErrorMessage(e));
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, refreshKey]);
  return (
    <div className="card">
      <h2 className="card-title">Audit trail</h2>
      <p className="text-muted form-hint">
        Riwayat aktivitas penting pada proyek ini (fase, SPH/PO, dokumen, progress, dll.).
      </p>
      <TabAlert message={err} variant="error" />
      {loading ? (
        <p className="text-muted">Memuat audit trail…</p>
      ) : items.length === 0 ? (
        <p className="text-muted">Belum ada entri audit.</p>
      ) : (
        <div className="table-scroll">
          <table className="audit-trail-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aktivitas</th>
                <th>Pengguna</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{formatDisplayDateTime(row.created_at)}</td>
                  <td>{row.action_label}</td>
                  <td>
                    {row.user_name?.trim() ||
                      row.user_email?.trim() ||
                      "—"}
                  </td>
                  <td>
                    <span className="audit-trail-detail">
                      {formatAuditDetail(row.detail ?? {})}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

