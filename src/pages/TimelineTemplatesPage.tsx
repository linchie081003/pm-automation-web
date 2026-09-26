import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";
import { rootPhaseWeightSum, validateTimelineItems } from "../lib/timelineValidation";

type TemplateItem = {
  row_key: string;
  name: string;
  duration_days: number;
  weight_pct: number;
  item_type: string;
  parent_key: string | null;
  sort_order: number;
};

type Template = {
  id: number;
  name: string;
  methodology: string;
  description: string | null;
  items: TemplateItem[];
  is_active: boolean;
};

function normalizeTemplateItem(it: TemplateItem): TemplateItem {
  const t = (it.item_type || "phase").toLowerCase();
  if (t === "milestone") {
    return { ...it, item_type: t, duration_days: 0, weight_pct: 0 };
  }
  return {
    ...it,
    item_type: t,
    duration_days: it.duration_days >= 1 ? it.duration_days : 1,
  };
}

const emptyItem = (order: number): TemplateItem => ({
  row_key: `item_${order}`,
  name: "",
  duration_days: 1,
  weight_pct: 0,
  item_type: "phase",
  parent_key: null,
  sort_order: order,
});

export default function TimelineTemplatesPage() {
  const [rows, setRows] = useState<Template[]>([]);
  const [err, setErr] = useState("");
  const [seedMsg, setSeedMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Template | null>(null);
  const [form, setForm] = useState({
    name: "",
    methodology: "waterfall",
    description: "",
    items: [] as TemplateItem[],
  });

  const weightSum = useMemo(() => rootPhaseWeightSum(form.items), [form.items]);

  const load = useCallback(() => {
    api<Template[]>("/timeline-templates?include_inactive=true").then(setRows).catch((e) => {
      setErr(getErrorMessage(e));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setEditId(null);
    setForm({ name: "", methodology: "waterfall", description: "", items: [emptyItem(0)] });
  };

  const startEdit = (t: Template) => {
    setEditId(t.id);
    const items = (t.items ?? []).map((it, i) =>
      normalizeTemplateItem({ ...it, sort_order: it.sort_order ?? i }),
    );
    setForm({
      name: t.name,
      methodology: t.methodology,
      description: t.description ?? "",
      items: items.length ? items : [emptyItem(0)],
    });
  };

  const updateItem = (index: number, patch: Partial<TemplateItem>) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === index ? normalizeTemplateItem({ ...it, ...patch }) : it,
      ),
    }));
  };

  const addRow = () => {
    setForm((f) => ({
      ...f,
      items: [...f.items, emptyItem(f.items.length)],
    }));
  };

  const removeRow = (index: number) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index).map((it, i) => ({ ...it, sort_order: i })),
    }));
  };

  const moveRow = (index: number, dir: -1 | 1) => {
    setForm((f) => {
      const j = index + dir;
      if (j < 0 || j >= f.items.length) return f;
      const items = [...f.items];
      [items[index], items[j]] = [items[j], items[index]];
      return { ...f, items: items.map((it, i) => ({ ...it, sort_order: i })) };
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const v = validateTimelineItems(form.items);
    if (v) {
      setErr(v);
      return;
    }
    const payload = {
      name: form.name.trim(),
      methodology: form.methodology,
      description: form.description.trim() || null,
      items: form.items.map(normalizeTemplateItem),
    };
    try {
      if (editId) {
        await api(`/timeline-templates/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/timeline-templates", { method: "POST", body: JSON.stringify(payload) });
      }
      startNew();
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const seedDefaults = async () => {
    setSeedMsg("");
    setErr("");
    try {
      await api("/timeline-templates/seed-defaults", { method: "POST" });
      setSeedMsg("Seed template default selesai (idempotent).");
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const openDetail = async (id: number) => {
    setErr("");
    setDetailId(id);
    try {
      const t = await api<Template>(`/timeline-templates/${id}`);
      setDetail(t);
      startEdit(t);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const deactivate = async (id: number) => {
    if (!window.confirm("Hapus template dari daftar aktif? (nonaktifkan)")) return;
    await api(`/timeline-templates/${id}`, { method: "DELETE" });
    if (detailId === id) {
      setDetailId(null);
      setDetail(null);
      startNew();
    }
    load();
  };

  const reactivate = async (t: Template) => {
    await api(`/timeline-templates/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
    load();
  };

  return (
    <>
      <p>
        <Link to="/config">← Setting</Link>
      </p>
      <h1 className="page-title">Template timeline</h1>
      {err && <p className="error">{err}</p>}
      {seedMsg && <p>{seedMsg}</p>}
      <div className="btn-group">
        <button type="button" onClick={seedDefaults}>
          Seed / perbarui template default (WBS)
        </button>
        <button type="button" onClick={startNew}>
          Template baru
        </button>
      </div>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Metodologi</th>
              <th>Item</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.methodology}</td>
                <td>{t.items?.length ?? 0}</td>
                <td>{t.is_active ? "Aktif" : "Nonaktif"}</td>
                <td>
                  <button type="button" className="link-button" onClick={() => openDetail(t.id)}>
                    Detail
                  </button>{" "}
                  <button type="button" className="link-button" onClick={() => startEdit(t)}>
                    Edit
                  </button>{" "}
                  {t.is_active ? (
                    <button type="button" className="danger-link" onClick={() => deactivate(t.id)}>
                      Hapus
                    </button>
                  ) : (
                    <button type="button" onClick={() => reactivate(t)}>
                      Aktifkan
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && detailId && (
        <div className="card">
          <h2 className="card-title">Detail: {detail.name}</h2>
          <p className="text-muted">
            {detail.methodology} · {detail.items?.length ?? 0} item ·{" "}
            {detail.is_active ? "Aktif" : "Nonaktif"}
          </p>
          {detail.description && <p>{detail.description}</p>}
        </div>
      )}
      <div className="card">
        <h2 className="card-title">{editId ? "Edit template" : "Template baru"}</h2>
        <form onSubmit={save}>
          <div className="form-row">
            <label>Nama</label>
            <input
              value={form.name}
              required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Metodologi</label>
            <select
              value={form.methodology}
              onChange={(e) => setForm({ ...form, methodology: e.target.value })}
            >
              <option value="waterfall">Waterfall</option>
              <option value="hybrid">Hybrid</option>
              <option value="agile">Agile</option>
            </select>
          </div>
          <div className="form-row">
            <label>Deskripsi</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <h3 className="card-title">
            Item timeline{" "}
            <span className={Math.abs(weightSum - 100) > 0.5 ? "error" : "text-muted"}>
              (bobot phase root: {weightSum.toFixed(1)}% / 100%)
            </span>
          </h3>
          <table className="data-table template-items-editor">
            <thead>
              <tr>
                <th>Urut</th>
                <th>row_key</th>
                <th>Nama</th>
                <th>Durasi</th>
                <th>Bobot %</th>
                <th>Tipe</th>
                <th>parent_key</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, i) => (
                <tr key={i}>
                  <td className="row-actions">
                    <button type="button" title="Naik" onClick={() => moveRow(i, -1)}>
                      ↑
                    </button>
                    <button type="button" title="Turun" onClick={() => moveRow(i, 1)}>
                      ↓
                    </button>
                  </td>
                  <td>
                    <input
                      value={it.row_key}
                      onChange={(e) => updateItem(i, { row_key: e.target.value })}
                    />
                  </td>
                  <td>
                    <input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                  </td>
                  <td>
                    {it.item_type === "milestone" ? (
                      <span className="text-muted" title="Gate pakai milestone date, bukan durasi">
                        —
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={it.duration_days || ""}
                        onChange={(e) =>
                          updateItem(i, {
                            duration_days: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      step={0.1}
                      readOnly={it.item_type === "milestone"}
                      value={it.item_type === "milestone" ? 0 : it.weight_pct}
                      onChange={(e) =>
                        updateItem(i, { weight_pct: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={it.item_type}
                      onChange={(e) => {
                        const t = e.target.value;
                        updateItem(i, {
                          item_type: t,
                          ...(t === "milestone"
                            ? { weight_pct: 0, duration_days: 0 }
                            : { duration_days: it.duration_days >= 1 ? it.duration_days : 1 }),
                        });
                      }}
                    >
                      <option value="phase">phase</option>
                      <option value="task">task</option>
                      <option value="subtask">subtask</option>
                      <option value="milestone">milestone (gate)</option>
                    </select>
                  </td>
                  <td>
                    {(it.item_type === "task" ||
                      it.item_type === "subtask" ||
                      it.item_type === "milestone") && (
                      <select
                        value={it.parent_key ?? ""}
                        onChange={(e) =>
                          updateItem(i, { parent_key: e.target.value.trim() || null })
                        }
                      >
                        <option value="">
                          {it.item_type === "milestone"
                            ? "— pilih phase induk —"
                            : "— root / pilih parent —"}
                        </option>
                        {form.items
                          .filter((p) => p.row_key !== it.row_key)
                          .map((p) => (
                            <option key={p.row_key} value={p.row_key}>
                              {p.name} ({p.item_type})
                            </option>
                          ))}
                      </select>
                    )}
                    {it.item_type === "phase" && (
                      <span className="text-muted" title="Phase di root">
                        root
                      </span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="danger-link" onClick={() => removeRow(i)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addRow}>
            + Baris
          </button>
          <div className="btn-group">
            <button type="submit" className="primary">
              Simpan
            </button>
            <button type="button" onClick={startNew}>
              Batal / baru
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
