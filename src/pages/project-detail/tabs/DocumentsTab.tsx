import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, getErrorMessage, previewFile, downloadFile } from "../../../api";
import { useAuth } from "../../../auth";
import { formatDisplayDate } from "../../../lib/formatDate";
import type { ProjectDetail } from "../projectDetailTypes";
import { TabAlert, TabNoticeStack } from "../shared/TabLayout";
export function DocumentsTab({
  projectId,
  detail,
}: {
  projectId: number;
  detail: ProjectDetail | null;
}) {
  const { can } = useAuth();
  const canUpload = can("documents.upload");
  const [docs, setDocs] = useState<
    { id: number; filename: string; doc_type: string; created_at: string }[]
  >([]);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [gdriveInfo, setGdriveInfo] = useState<{
    configured: boolean;
    service_account_email: string | null;
  } | null>(null);
  const load = () =>
    api<typeof docs>(`/projects/${projectId}/documents`)
      .then(setDocs)
      .catch((e) => setErr(getErrorMessage(e)));
  useEffect(() => {
    load();
    api<{ configured: boolean; service_account_email: string | null }>(
      "/integrations/google-drive",
    )
      .then(setGdriveInfo)
      .catch(() => setGdriveInfo(null));
  }, [projectId]);
  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/projects/${projectId}/documents?doc_type=${encodeURIComponent(docType)}`,
        {
          method: "POST",
          credentials: "include",
          body: fd,
        },
      );
      if (!res.ok) {
        const text = await res.text();
        let body: unknown = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = text;
        }
        throw new Error(
          formatApiError(
            res.status,
            `/projects/${projectId}/documents`,
            body,
            "Upload gagal",
          ),
        );
      }
      const body = (await res.json()) as {
        gdrive_url?: string;
        gdrive_error?: string;
      };
      setFile(null);
      if (body.gdrive_url) {
        setErr("");
      } else if (body.gdrive_error) {
        setErr(
          `Tersimpan di server PDC. Google Drive: ${body.gdrive_error}`,
        );
      }
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };
  const removeDoc = async (id: number, filename: string) => {
    if (!window.confirm(`Hapus dokumen "${filename}"?`)) return;
    setErr("");
    try {
      await api(`/projects/${projectId}/documents/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };
  const saveRepo = async () => {
    const url = prompt("Google Drive folder URL", detail?.document_repo_url ?? "");
    if (url === null) return;
    await api(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ document_repo_url: url }),
    });
  };
  return (
    <div className="card">
      <TabNoticeStack>
        <TabAlert message={err} variant="error" />
      </TabNoticeStack>
      <p>
        Repo dokumen:{" "}
        {detail?.document_repo_url ? (
          <a href={detail.document_repo_url} target="_blank" rel="noreferrer">
            GDrive
          </a>
        ) : (
          "—"
        )}{" "}
        <button type="button" onClick={saveRepo}>
          Set GDrive link
        </button>
      </p>
      <p className="text-muted form-hint">
        Link folder menentukan <strong>tujuan</strong> salinan Drive. Service account diatur di{" "}
        <Link to="/config/google-drive">Setting → Google Drive</Link>
        {gdriveInfo?.configured ? (
          <>
            {" "}
            (aktif — bagikan folder ke{" "}
            <strong>{gdriveInfo.service_account_email ?? "service account"}</strong> sebagai Editor).
          </>
        ) : (
          <> — belum dikonfigurasi; file tetap tersimpan lokal di PDC.</>
        )}
      </p>
      {canUpload && (
        <form className="doc-upload-bar" onSubmit={upload}>
          <div className="form-row">
            <label htmlFor="doc-type">Tipe dokumen</label>
            <select
              id="doc-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="po">PO</option>
              <option value="sph">SPH</option>
              <option value="mom">MoM</option>
              <option value="progress_report">Progress report</option>
              <option value="draft_bast">Draft BAST</option>
              <option value="other">Lainnya</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="doc-file">File</label>
            <input
              id="doc-file"
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
      <p className="text-muted">
        Dokumen dari generate (laporan, deck) dan upload manual tampil di bawah.
      </p>
      {docs.length === 0 ? (
        <p className="text-muted">Belum ada dokumen.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipe</th>
              <th>File</th>
              <th>Diunggah</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="badge badge-indigo">{d.doc_type}</span>
                </td>
                <td>{d.filename}</td>
                <td>{formatDisplayDate(d.created_at)}</td>
                <td>
                  <div className="doc-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        previewFile(
                          `/projects/${projectId}/documents/${d.id}/preview`,
                        ).catch((e) => setErr(getErrorMessage(e)))
                      }
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        downloadFile(
                          `/projects/${projectId}/documents/${d.id}/download`,
                          d.filename,
                        ).catch((e) => setErr(getErrorMessage(e)))
                      }
                    >
                      Download
                    </button>
                    {canUpload && (
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => removeDoc(d.id, d.filename)}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

