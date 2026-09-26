import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { RequirePerm } from "../auth";

type UserRow = {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  roles: { id: number; code: string; name: string }[];
};

type Role = { id: number; code: string; name: string };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [error, setError] = useState("");

  const load = async () => {
    const [u, r] = await Promise.all([
      api<UserRow[]>("/users"),
      api<{ id: number; code: string; name: string }[]>("/roles"),
    ]);
    setUsers(u);
    setRoles(r);
  };

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          name,
          password,
          role_ids: roleId ? [roleId] : [],
        }),
      });
      setEmail("");
      setName("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal");
    }
  };

  return (
    <RequirePerm perm="users.read">
      <h1 className="page-title">Users</h1>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <h2 className="card-title">Tambah user</h2>
        <form onSubmit={onCreate}>
          <div className="form-row">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Nama</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Password (min 8)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="form-row">
            <label>Role</label>
            <select
              value={roleId}
              onChange={(e) =>
                setRoleId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="primary">
            Simpan
          </button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nama</th>
              <th>Roles</th>
              <th>Aktif</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.roles.map((r) => r.code).join(", ")}</td>
                <td>{u.is_active ? "Ya" : "Tidak"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RequirePerm>
  );
}
