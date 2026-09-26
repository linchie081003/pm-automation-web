import { useEffect, useState } from "react";
import { api } from "../api";
import { RequirePerm } from "../auth";

type Approval = {
  id: number;
  project_code: string;
  from_phase: string;
  to_phase: string;
  status: string;
};

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [msg, setMsg] = useState("");

  const load = () => api<Approval[]>("/approvals/pending").then(setItems);

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, []);

  const decide = async (id: number, approve: boolean) => {
    setMsg("");
    await api(`/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ approve, comment: approve ? "Approved" : "Rejected" }),
    });
    await load();
  };

  return (
    <RequirePerm perm="approvals.decide">
      <h1 className="page-title">Kotak Approval</h1>
      {msg && <p className="error">{msg}</p>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Proyek</th>
              <th>Dari</th>
              <th>Ke</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{a.project_code}</td>
                <td>{a.from_phase}</td>
                <td>{a.to_phase}</td>
                <td>
                  <button type="button" className="primary" onClick={() => decide(a.id, true)}>
                    Approve
                  </button>{" "}
                  <button type="button" onClick={() => decide(a.id, false)}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p>Tidak ada approval pending.</p>}
      </div>
    </RequirePerm>
  );
}
