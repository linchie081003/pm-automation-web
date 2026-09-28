import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";
import { RequirePerm } from "../auth";

type MappingRow = {
  status: string;
  bucket: string;
  progress_fallback: number;
};

type StatusMappingPayload = {
  mappings: MappingRow[];
  buckets: string[];
  bucket_default_progress: Record<string, number>;
  default_templates: MappingRow[];
  progress_rules: string;
};

const BUCKET_OPTIONS = ["TODO", "IN PROGRESS", "DONE"] as const;

function defaultProgressForBucket(bucket: string, defaults: Record<string, number>): number {
  return defaults[bucket] ?? 50;
}

export default function ClickUpStatusMappingPage() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [bucketDefaults, setBucketDefaults] = useState<Record<string, number>>({
    TODO: 0,
    "IN PROGRESS": 50,
    DONE: 100,
  });
  const [templates, setTemplates] = useState<MappingRow[]>([]);
  const [rules, setRules] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api<StatusMappingPayload>("/integrations/clickup/status-mappings")
      .then((r) => {
        setBucketDefaults(r.bucket_default_progress ?? bucketDefaults);
        setTemplates(
          (r.default_templates ?? []).map((t) => ({
            status: String(t.status),
            bucket: String(t.bucket),
            progress_fallback: Number(t.progress_fallback ?? 0),
          })),
        );
        setRules(r.progress_rules ?? "");
        setRows(
          r.mappings.length
            ? r.mappings.map((m) => ({
                status: m.status,
                bucket: m.bucket,
                progress_fallback:
                  m.progress_fallback ??
                  defaultProgressForBucket(m.bucket, r.bucket_default_progress),
              }))
            : [],
        );
      })
      .catch((e) => setErr(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { status: "", bucket: "IN PROGRESS", progress_fallback: bucketDefaults["IN PROGRESS"] ?? 50 },
    ]);
  };

  const loadTemplates = () => {
    setRows(templates.map((t) => ({ ...t })));
    setMsg("Template default dimuat ke editor — klik Simpan mapping untuk menyimpan ke database.");
  };

  const updateRow = (index: number, patch: Partial<MappingRow>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        if (patch.bucket && patch.progress_fallback === undefined) {
          next.progress_fallback = defaultProgressForBucket(patch.bucket, bucketDefaults);
        }
        return next;
      }),
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const cleaned = rows.filter((r) => r.status.trim());
    if (cleaned.some((r) => !r.bucket)) {
      setErr("Setiap baris wajib punya status ClickUp dan status aplikasi (bucket).");
      return;
    }
    try {
      await api("/integrations/clickup/status-mappings", {
        method: "PUT",
        body: JSON.stringify({ mappings: cleaned }),
      });
      setMsg("Mapping status & progress disimpan.");
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  return (
    <RequirePerm perm="integrations.clickup.configure">
      <p>
        <Link to="/config">← Setting</Link>
      </p>
      <h1 className="page-title">Mapping status ClickUp → progress</h1>
      <p className="text-muted form-hint">
        Setiap baris menghubungkan <strong>teks status di ClickUp</strong> ke{" "}
        <strong>status aplikasi PDC</strong> (TODO / IN PROGRESS / DONE) dan{" "}
        <strong>progress fallback (%)</strong> bila ClickUp tidak mengirim percent_complete atau time
        tracking.
      </p>
      {rules && <p className="text-muted form-hint">{rules}</p>}
      <div className="card sph-info-panel" style={{ marginBottom: "1rem" }}>
        <p className="form-hint" style={{ margin: 0 }}>
          <strong>Default bucket → progress:</strong> TODO = {bucketDefaults.TODO ?? 0}% · IN PROGRESS
          = {bucketDefaults["IN PROGRESS"] ?? 50}% · DONE = {bucketDefaults.DONE ?? 100}%
        </p>
      </div>
      {err && <p className="error">{err}</p>}
      {msg && <p>{msg}</p>}
      <form onSubmit={save} className="card">
        <div
          className="timeline-detail-grid timeline-detail-grid--head"
          style={{ gridTemplateColumns: "1.4fr 1fr 6rem 4rem" }}
          role="row"
        >
          <span>Status ClickUp</span>
          <span>Status aplikasi (PDC)</span>
          <span>Progress %</span>
          <span aria-hidden />
        </div>
        {rows.length === 0 && (
          <p className="text-muted" style={{ padding: "0.75rem 0" }}>
            Belum ada mapping tersimpan. Klik <strong>Muat default sistem</strong> lalu edit/simpan, atau
            Tambah baris manual.
          </p>
        )}
        {rows.map((row, i) => (
          <div
            key={i}
            className="timeline-detail-grid timeline-detail-grid--row"
            style={{ gridTemplateColumns: "1.4fr 1fr 6rem 4rem" }}
            role="row"
          >
            <input
              value={row.status}
              onChange={(e) => updateRow(i, { status: e.target.value })}
              placeholder="Contoh: Ready to Deploy"
            />
            <select
              value={row.bucket}
              onChange={(e) => updateRow(i, { bucket: e.target.value })}
            >
              {BUCKET_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={row.progress_fallback}
              onChange={(e) =>
                updateRow(i, { progress_fallback: Number(e.target.value) })
              }
            />
            <button type="button" onClick={() => removeRow(i)}>
              Hapus
            </button>
          </div>
        ))}
        <div className="btn-group" style={{ marginTop: "1rem" }}>
          <button type="button" onClick={addRow}>
            Tambah baris
          </button>
          <button type="button" onClick={loadTemplates}>
            Muat default sistem
          </button>
          <button type="submit" className="primary">
            Simpan mapping
          </button>
        </div>
      </form>
    </RequirePerm>
  );
}
