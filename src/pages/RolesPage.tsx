import { useEffect, useState } from "react";
import { api } from "../api";
import { RequirePerm } from "../auth";

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
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [r, p] = await Promise.all([
      api<Role[]>("/roles"),
      api<Permission[]>("/permissions"),
    ]);
    setRoles(r);
    setPerms(p);
    if (!selectedId && r.length) setSelectedId(r[0].id);
  };

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, []);

  useEffect(() => {
    const role = roles.find((r) => r.id === selectedId);
    if (role) setChecked(new Set(role.permission_codes));
  }, [selectedId, roles]);

  const save = async () => {
    if (!selectedId) return;
    setMsg("");
    try {
      await api(`/roles/${selectedId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_codes: [...checked] }),
      });
      setMsg("Permission disimpan.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal simpan");
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

  return (
    <RequirePerm perm="roles.read">
      <h1 className="page-title">Roles & Permission</h1>
      {msg && <p>{msg}</p>}
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
                  />
                  <span>
                    {p.code}
                    <br />
                    <small>{p.name}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="primary" onClick={save}>
          Simpan permission role
        </button>
      </div>
    </RequirePerm>
  );
}
