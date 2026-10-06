import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getErrorMessage } from "../api";
import { RequirePerm, useAuth } from "../auth";
import { PasswordInput } from "../components/PasswordInput";
import { formatDisplayDateTime } from "../lib/formatDate";

type UserRow = {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  last_login: string | null;
  roles: { id: number; code: string; name: string }[];
};

type Role = { id: number; code: string; name: string };

export default function UsersPage() {
  const { can } = useAuth();
  const canWrite = can("users.write");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [passwordUser, setPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [u, r] = await Promise.all([
      api<UserRow[]>("/users"),
      api<{ id: number; code: string; name: string }[]>("/roles"),
    ]);
    setUsers(u);
    setRoles(r);
  };

  useEffect(() => {
    load().catch((e) => setError(getErrorMessage(e)));
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.roles.some((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
    );
  }, [users, search]);

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
      setError(getErrorMessage(err));
    }
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditName(u.name);
    setEditRoleIds(u.roles.map((r) => r.id));
    setEditActive(u.is_active);
    setError("");
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const openChangePassword = (u: UserRow) => {
    setPasswordUser(u);
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const closeChangePassword = () => {
    setPasswordUser(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  const toggleEditRole = (id: number) => {
    setEditRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    setBusy(true);
    try {
      await api(`/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          is_active: editActive,
          role_ids: editRoleIds,
        }),
      });
      closeEdit();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordUser) return;
    const pwd = newPassword.trim();
    const confirm = confirmPassword.trim();
    if (pwd.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (pwd !== confirm) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api(`/users/${passwordUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: pwd }),
      });
      closeChangePassword();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onToggleActive = async (u: UserRow) => {
    if (!window.confirm(`${u.is_active ? "Nonaktifkan" : "Aktifkan"} user ${u.email}?`)) return;
    setError("");
    try {
      await api(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <RequirePerm perm="users.read">
      <h1 className="page-title">Users</h1>
      {error && <p className="error">{error}</p>}
      {canWrite && (
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
              <PasswordInput
                label="Password (min 8)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="form-row">
              <label>Role</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
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
      )}

      {canWrite && editing && (
        <div className="card">
          <h2 className="card-title">Edit user — {editing.email}</h2>
          <form onSubmit={onSaveEdit}>
            <div className="form-row">
              <label>Nama</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <label>Roles</label>
              <div className="perm-grid">
                {roles.map((r) => (
                  <label key={r.id}>
                    <input
                      type="checkbox"
                      checked={editRoleIds.includes(r.id)}
                      onChange={() => toggleEditRole(r.id)}
                    />
                    {r.name} ({r.code})
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />{" "}
                Akun aktif
              </label>
            </div>
            <p className="text-muted" style={{ marginTop: 0 }}>
              Ubah password lewat tombol <strong>Password</strong> di tabel user.
            </p>
            <div className="btn-group">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan perubahan"}
              </button>
              <button type="button" onClick={closeEdit} disabled={busy}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {canWrite && passwordUser && (
        <div className="card">
          <h2 className="card-title">Ubah password — {passwordUser.email}</h2>
          <form onSubmit={onSavePassword}>
            <div className="form-row">
              <PasswordInput
                label="Password baru (min 8)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="form-row">
              <PasswordInput
                label="Konfirmasi password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="btn-group">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan password"}
              </button>
              <button type="button" onClick={closeChangePassword} disabled={busy}>
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="form-row" style={{ maxWidth: "24rem", marginBottom: "1rem" }}>
          <label>Cari user</label>
          <input
            type="search"
            placeholder="Email, nama, atau role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-muted" style={{ marginTop: 0 }}>
          {filteredUsers.length} dari {users.length} user
        </p>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nama</th>
              <th>Roles</th>
              <th>Login terakhir</th>
              <th>Aktif</th>
              {canWrite && <th>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.roles.map((r) => r.code).join(", ") || "—"}</td>
                <td>{formatDisplayDateTime(u.last_login)}</td>
                <td>{u.is_active ? "Ya" : "Tidak"}</td>
                {canWrite && (
                  <td>
                    <div className="btn-group">
                      <button type="button" onClick={() => openEdit(u)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => openChangePassword(u)}>
                        Password
                      </button>
                      <button type="button" onClick={() => void onToggleActive(u)}>
                        {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RequirePerm>
  );
}
