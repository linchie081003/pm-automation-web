import { FormEvent, useEffect, useState } from "react";
import { api, getErrorMessage } from "../api";
import { RequirePerm, useAuth } from "../auth";
import { visibleMainNavItems } from "../lib/mainNav";

const MENU_PERM_HINT: Record<string, string> = {
  "approvals.decide": "Menu sidebar: Approval",
  "rebaseline.approve": "Menu sidebar: Rebaseline",
};

type Role = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_codes: string[];
};

type Permission = {
  id: number;
  code: string;
  name: string;
  module: string;
};

export default function RolesPage() {
  const { can, user, refresh } = useAuth();
  const canWrite = can("roles.write");
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const load = async () => {
    const [r, p] = await Promise.all([
      api<Role[]>("/roles"),
      api<Permission[]>("/permissions"),
    ]);
    setRoles(r);
    setPerms(p);
    if (!selectedId && r.length) setSelectedId(r[0].id);
    else if (selectedId && !r.some((x) => x.id === selectedId) && r.length) {
      setSelectedId(r[0].id);
    }
  };

  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    const role = roles.find((r) => r.id === selectedId);
    if (role) setChecked(new Set(role.permission_codes));
  }, [selectedId, roles]);

  const selectedRole = roles.find((r) => r.id === selectedId);

  const save = async () => {
    if (!selectedId) return;
    setMsg("");
    try {
      await api(`/roles/${selectedId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_codes: [...checked] }),
      });
      await load();
      await refresh();
      setMsg("Permission disimpan. Menu sidebar memakai permission akun yang sedang login.");
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  const onCreateRole = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      const created = await api<Role>("/roles", {
        method: "POST",
        body: JSON.stringify({
          code: newCode.trim(),
          name: newName.trim(),
          description: newDescription.trim() || null,
        }),
      });
      setNewCode("");
      setNewName("");
      setNewDescription("");
      await load();
      setSelectedId(created.id);
      setMsg(`Role "${created.name}" dibuat.`);
    } catch (err) {
      setMsg(getErrorMessage(err));
    }
  };

  const onDeleteRole = async () => {
    if (!selectedRole || selectedRole.is_system) return;
    if (
      !window.confirm(
        `Hapus role "${selectedRole.name}" (${selectedRole.code})? Role yang masih dipakai user tidak bisa dihapus.`,
      )
    ) {
      return;
    }
    setMsg("");
    try {
      await api(`/roles/${selectedRole.id}`, { method: "DELETE" });
      setMsg(`Role "${selectedRole.name}" dihapus.`);
      setSelectedId(null);
      await load();
    } catch (err) {
      setMsg(getErrorMessage(err));
    }
  };

  const toggle = (code: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const byModule = perms.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {});

  const myMenu = visibleMainNavItems(can)
    .map((i) => i.label)
    .filter((l) => !["Dashboard", "Proyek"].includes(l));

  return (
    <RequirePerm perm="roles.read">
      <h1 className="page-title">Roles & Permission</h1>
      {msg && <p className={msg.includes("Gagal") || msg.includes("masih dipakai") ? "error" : ""}>{msg}</p>}
      {user && (
        <div className="card" style={{ marginBottom: "1rem", background: "#f8fafc" }}>
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>Akun login:</strong> {user.email} · role:{" "}
            {user.roles.map((r) => r.code).join(", ") || "—"}
          </p>
          <p className="text-muted" style={{ margin: 0 }}>
            Menu sidebar mengikuti <strong>permission akun Anda</strong> (gabungan semua role), bukan role
            yang sedang diedit di dropdown. Approval butuh <code>approvals.decide</code> (bukan{" "}
            <code>approvals.request</code>). Rebaseline (approve) butuh{" "}
            <code>rebaseline.approve</code> (bukan <code>rebaseline.request</code> /{" "}
            <code>schedule.rebaseline</code>). Menu opsional Anda:{" "}
            {myMenu.length ? myMenu.join(", ") : "— hanya Dashboard & Proyek —"}
          </p>
        </div>
      )}

      {canWrite && (
        <div className="card">
          <h2 className="card-title">Tambah role</h2>
          <form onSubmit={onCreateRole}>
            <div className="form-row">
              <label>Kode (unik, snake_case)</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                minLength={2}
                pattern="[a-z][a-z0-9_]*"
                title="Huruf kecil, angka, underscore"
              />
            </div>
            <div className="form-row">
              <label>Nama tampilan</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Deskripsi (opsional)</label>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <button type="submit" className="primary">
              Buat role
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <label>
          Role{" "}
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code}){r.is_system ? " [system]" : ""}
              </option>
            ))}
          </select>
        </label>
        {canWrite && selectedRole && !selectedRole.is_system && (
          <p style={{ marginTop: "1rem" }}>
            <button type="button" className="text-danger" onClick={() => void onDeleteRole()}>
              Hapus role ini
            </button>
          </p>
        )}
        {selectedRole?.is_system && (
          <p className="text-muted" style={{ marginTop: "0.75rem" }}>
            Role system tidak bisa dihapus.
          </p>
        )}
      </div>
      <div className="card">
        <h2>Permission</h2>
        {Object.entries(byModule).map(([mod, list]) => (
          <div key={mod} style={{ marginBottom: "1rem" }}>
            <strong>{mod}</strong>
            <div className="perm-grid">
              {list.map((p) => (
                <label key={p.code}>
                  <input
                    type="checkbox"
                    checked={checked.has(p.code)}
                    onChange={() => toggle(p.code)}
                    disabled={!canWrite}
                  />
                  <span>
                    {p.code}
                    <br />
                    <small>{p.name}</small>
                    {MENU_PERM_HINT[p.code] ? (
                      <>
                        <br />
                        <small className="text-muted">{MENU_PERM_HINT[p.code]}</small>
                      </>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {canWrite && (
          <button type="button" className="primary" onClick={save}>
            Simpan permission role
          </button>
        )}
      </div>
    </RequirePerm>
  );
}
