import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { useAuth } from "../../../auth";
import { TabAlert } from "../shared/TabLayout";
export function MembersTab({ projectId }: { projectId: number }) {
  const { can } = useAuth();
  const canEdit = can("projects.assign_members") || can("projects.write");
  const [members, setMembers] = useState<
    { id: number; full_name: string; email: string; role_label: string }[]
  >([]);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", role_label: "" });
  const [msg, setMsg] = useState("");
  const load = () => api<typeof members>(`/projects/${projectId}/roster`).then(setMembers);
  useEffect(() => {
    load().catch(() => {});
  }, [projectId]);
  const addMember = async () => {
    if (!addForm.full_name.trim()) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/roster`, {
        method: "POST",
        body: JSON.stringify(addForm),
      });
      setAddForm({ full_name: "", email: "", role_label: "" });
      load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const removeMember = async (memberId: number) => {
    if (!window.confirm("Hapus anggota dari daftar?")) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/roster/${memberId}`, { method: "DELETE" });
      load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card">
      <h2 className="card-title">Anggota proyek</h2>
      <TabAlert message={msg} />
      <table className="data-table">
        <thead>
          <tr>
            <th>Nama lengkap</th>
            <th>Email</th>
            <th>Peran</th>
            {canEdit && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.full_name}</td>
              <td>{m.email || "—"}</td>
              <td>{m.role_label || "—"}</td>
              {canEdit && (
                <td>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() => removeMember(m.id)}
                  >
                    Hapus
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <>
          <div className="form-row" style={{ marginTop: "1rem" }}>
            <label>Nama lengkap</label>
            <input
              value={addForm.full_name}
              onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Email</label>
            <input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Peran</label>
            <input
              value={addForm.role_label}
              placeholder="PM, Developer, …"
              onChange={(e) => setAddForm({ ...addForm, role_label: e.target.value })}
            />
          </div>
          <button type="button" className="primary" onClick={addMember}>
            Tambah anggota
          </button>
        </>
      )}
    </div>
  );
}

