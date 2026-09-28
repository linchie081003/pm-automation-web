import { FormEvent, useEffect, useState } from "react";

import { getErrorMessage, uploadProjectDocument } from "../api";
import { formatDisplayDate } from "../lib/formatDate";
import { useAuth } from "../auth";

type DocRow = {
  id: number;
  filename: string;
  doc_type: string;
  created_at: string;
  external_url?: string | null;
};

export function TabDocumentUpload({
  projectId,
  docType,
  phase,
  title,
  hint,
  readOnly,
}: {
  projectId: number;
  docType: string;
  phase?: string;
  title: string;
  hint?: string;
  readOnly?: boolean;
}) {
  const { can } = useAuth();
  const canUpload = can("documents.upload") && !readOnly;
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);

  const load = () =>
    fetch(`/api/projects/${projectId}/documents`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat dokumen");
        const rows = (await res.json()) as DocRow[];
        setDocs(rows.filter((d) => d.doc_type === docType));
      })
      .catch(() => setDocs([]));

  useEffect(() => {
    load();
  }, [projectId, docType]);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canUpload) return;
    setUploading(true);
    setMsg("");
    setMsgOk(false);
    try {
      const result = await uploadProjectDocument(projectId, file, docType, phase);
      setFile(null);
      setMsgOk(true);
      if (result.gdrive_url) {
        setMsg("File diunggah ke server dan Google Drive.");
      } else if (result.gdrive_error) {
        setMsg(
          `File tersimpan di PDC (tab Documents). Google Drive: ${result.gdrive_error}`,
        );
        setMsgOk(false);
      } else {
        setMsg("File diunggah — lihat juga tab Documents.");
      }
      load();
    } catch (err) {
      setMsg(getErrorMessage(err));
      setMsgOk(false);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="card tab-doc-upload" style={{ marginTop: "1rem" }}>
      <h3 className="card-title">{title}</h3>
      {hint && <p className="text-muted form-hint">{hint}</p>}
      {msg && (
        <div className={`alert alert--${msgOk ? "success" : "error"}`} role="status">
          {msg}
        </div>
      )}
      {canUpload && (
        <form className="doc-upload-bar" onSubmit={upload}>
          <div className="form-row">
            <label htmlFor={`doc-file-${docType}`}>File</label>
            <input
              id={`doc-file-${docType}`}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button type="submit" className="primary" disabled={!file || uploading}>
            {uploading ? "Mengunggah…" : "Upload dokumen"}
          </button>
        </form>
      )}
      {!canUpload && !readOnly && (
        <p className="text-muted">Anda tidak punya izin upload dokumen.</p>
      )}
      {docs.length === 0 ? (
        <p className="text-muted">Belum ada dokumen untuk bagian ini.</p>
      ) : (
        <ul className="plain tab-doc-upload__list">
          {docs.map((d) => (
            <li key={d.id}>
              <strong>{d.filename}</strong>
              <span className="text-muted"> — {formatDisplayDate(d.created_at)}</span>
              {d.external_url && (
                <>
                  {" "}
                  <a href={d.external_url} target="_blank" rel="noreferrer">
                    GDrive
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
