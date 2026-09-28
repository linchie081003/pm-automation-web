import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { api, getErrorMessage } from "../api";

type GDriveConfig = {
  configured: boolean;
  service_account_email: string | null;
  has_credentials: boolean;
  configured_at: string | null;
  env_fallback: boolean;
};

export default function GoogleDriveIntegrationPage() {
  const { refresh, can } = useAuth();
  const [cfg, setCfg] = useState<GDriveConfig | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<GDriveConfig>("/integrations/google-drive")
      .then(setCfg)
      .catch((e) => setErr(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uploadCredentials = async (e: FormEvent) => {
    e.preventDefault();
    if (!jsonFile) {
      setErr("Pilih file JSON service account dari Google Cloud.");
      return;
    }
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await refresh();
      const text = await jsonFile.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("File bukan JSON yang valid.");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON harus berupa objek service account.");
      }
      const data = await api<{ service_account_email?: string }>(
        "/integrations/google-drive/credentials/json",
        {
          method: "POST",
          body: JSON.stringify({ service_account_json: parsed }),
        },
      );
      setJsonFile(null);
      setMsg(
        data.service_account_email
          ? `Kredensial disimpan — ${data.service_account_email}`
          : "Kredensial disimpan.",
      );
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; service_account_email?: string }>(
        "/integrations/google-drive/test",
        { method: "POST" },
      );
      setMsg(
        r.service_account_email
          ? `Koneksi Google Drive OK — ${r.service_account_email}`
          : "Koneksi Google Drive OK.",
      );
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const removeCredentials = async () => {
    if (
      !window.confirm(
        "Hapus kredensial Google Drive dari database? Upload ke Drive akan berhenti (kecuali fallback .env masih aktif).",
      )
    ) {
      return;
    }
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await api("/integrations/google-drive/credentials", { method: "DELETE" });
      setMsg("Kredensial dihapus.");
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = cfg?.configured
    ? cfg.env_fallback
      ? "Aktif via file .env (GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE)"
      : "Siap — upload dokumen proyek akan disalin ke folder GDrive"
    : "Belum dikonfigurasi";

  return (
    <>
      <p>
        <Link to="/config">← Setting</Link>
      </p>
      <h1 className="page-title">Integrasi Google Drive</h1>
      {err && <p className="error">{err}</p>}
      {msg && <p>{msg}</p>}
      <form onSubmit={uploadCredentials} className="card">
        <p className="text-muted">
          Status: <strong>{statusLabel}</strong>
          {cfg?.has_credentials && cfg.service_account_email && (
            <>
              {" "}
              · Akun: <strong>{cfg.service_account_email}</strong>
            </>
          )}
          {cfg?.configured_at && (
            <>
              {" "}
              · Diperbarui: {new Date(cfg.configured_at).toLocaleString()}
            </>
          )}
        </p>
        <p className="text-muted form-hint">
          Unduh JSON key dari Google Cloud Console (IAM → Service Accounts → Keys). Isi JSON hanya
          disimpan di <strong>database</strong> (tabel integrasi), tidak ditulis ke disk server dan
          jangan di-commit ke git. Bagikan folder proyek di Drive ke <code>client_email</code> sebagai
          Editor. Link folder per proyek: tab Documents → Set GDrive link.
        </p>
        {!can("integrations.google_drive.configure") && (
          <p className="error">
            Akun Anda tidak punya permission <code>integrations.google_drive.configure</code> (biasanya
            admin). Minta admin menyimpan kredensial atau tambahkan permission ke role Anda.
          </p>
        )}
        <div className="form-row">
          <label htmlFor="gdrive-sa-json">File JSON service account</label>
          <input
            id="gdrive-sa-json"
            type="file"
            accept=".json,application/json"
            onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="btn-group">
          <button
            type="submit"
            className="primary"
            disabled={busy || !jsonFile || !can("integrations.google_drive.configure")}
          >
            Simpan kredensial
          </button>
          <button type="button" onClick={test} disabled={busy || !cfg?.configured}>
            Test koneksi
          </button>
          {cfg?.has_credentials && (
            <button type="button" onClick={removeCredentials} disabled={busy}>
              Hapus kredensial
            </button>
          )}
        </div>
      </form>
    </>
  );
}
