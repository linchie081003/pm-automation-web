import { FormEvent, useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { useAuth } from "../../../auth";
import { TabAlert, TabFormFooter } from "../shared/TabLayout";
export type ChangeRequestRow = {
  id: number;
  cr_no: string;
  title: string;
  background: string | null;
  scope_change: string | null;
  schedule_impact_days: number | null;
  cost_impact_rupiah: number | null;
  priority: string;
  status: string;
  decision_comment: string | null;
};

export function ChangeRequestsTab({
  projectId,
  inDelivery,
}: {
  projectId: number;
  inDelivery: boolean;
}) {
  const { can } = useAuth();
  const canWrite = can("projects.write");
  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    background: "",
    scope_change: "",
    schedule_impact_days: "",
    cost_impact_rupiah: "",
    priority: "medium",
  });
  const load = () =>
    api<ChangeRequestRow[]>(`/projects/${projectId}/change-requests`).then(setRows);
  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
  }, [projectId]);
  const createCr = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/change-requests`, {
        method: "POST",
        body: JSON.stringify({
          title: draft.title.trim(),
          background: draft.background || null,
          scope_change: draft.scope_change || null,
          schedule_impact_days: draft.schedule_impact_days
            ? Number(draft.schedule_impact_days)
            : null,
          cost_impact_rupiah: draft.cost_impact_rupiah
            ? Number(draft.cost_impact_rupiah)
            : null,
          priority: draft.priority,
        }),
      });
      setDraft({
        title: "",
        background: "",
        scope_change: "",
        schedule_impact_days: "",
        cost_impact_rupiah: "",
        priority: "medium",
      });
      setMsg("Change Request draft dibuat.");
      load();
    } catch (err) {
      setMsg(getErrorMessage(err));
    }
  };
  const act = async (id: number, path: string, body?: object) => {
    setMsg("");
    try {
      await api(`/projects/${projectId}/change-requests/${id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
    } catch (err) {
      setMsg(getErrorMessage(err));
    }
  };
  return (
    <div className="card">
      <h2 className="card-title">Change Request (CR)</h2>
      <p className="text-muted">
        Mekanisme CR standar: draft → submit → review (approve/reject) → implement.{" "}
        {inDelivery
          ? "Gunakan CR untuk perubahan scope/jadwal/biaya setelah baseline Kick Off."
          : "CR paling relevan setelah proyek in delivery."}
      </p>
      <TabAlert message={msg} />
      {canWrite && (
        <form onSubmit={createCr} className="cr-form">
          <h3 className="subsection-title">Buat CR baru</h3>
          <div className="form-row">
            <label>Judul CR</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <label>Latar belakang</label>
            <textarea
              rows={2}
              value={draft.background}
              onChange={(e) => setDraft({ ...draft, background: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Perubahan scope</label>
            <textarea
              rows={2}
              value={draft.scope_change}
              onChange={(e) => setDraft({ ...draft, scope_change: e.target.value })}
            />
          </div>
          <div className="form-grid-2">
            <div className="form-row">
              <label>Dampak jadwal (hari)</label>
              <input
                type="number"
                value={draft.schedule_impact_days}
                onChange={(e) =>
                  setDraft({ ...draft, schedule_impact_days: e.target.value })
                }
              />
            </div>
            <div className="form-row">
              <label>Dampak biaya (Rp)</label>
              <input
                type="number"
                value={draft.cost_impact_rupiah}
                onChange={(e) =>
                  setDraft({ ...draft, cost_impact_rupiah: e.target.value })
                }
              />
            </div>
          </div>
          <TabFormFooter hint="Draft disimpan di proyek; lanjutkan workflow persetujuan CR bila diperlukan.">
            <button type="submit" className="primary">
              Simpan draft CR
            </button>
          </TabFormFooter>
        </form>
      )}
      <div className="table-scroll" style={{ marginTop: "1rem" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Judul</th>
              <th>Status</th>
              <th>Prioritas</th>
              <th>Dampak hari</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  Belum ada CR.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.cr_no}</td>
                  <td>{r.title}</td>
                  <td>{r.status}</td>
                  <td>{r.priority}</td>
                  <td>{r.schedule_impact_days ?? "—"}</td>
                  <td>
                    {canWrite && r.status === "draft" && (
                      <button type="button" onClick={() => act(r.id, "submit")}>
                        Submit
                      </button>
                    )}
                    {canWrite && r.status === "submitted" && (
                      <>
                        <button
                          type="button"
                          onClick={() => act(r.id, "decide", { approve: true })}
                        >
                          Approve
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() => act(r.id, "decide", { approve: false })}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {canWrite && r.status === "approved" && (
                      <button type="button" onClick={() => act(r.id, "implement")}>
                        Implement
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

