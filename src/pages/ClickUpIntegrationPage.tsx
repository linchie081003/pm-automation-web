import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../api";

type ClickUpConfig = {
  configured: boolean;
  clickup_team_id: string | null;
  clickup_default_space_id: string | null;
  clickup_offer_on_kickoff: boolean;
  has_token: boolean;
};

function validateTeamId(teamId: string): string | null {
  const tid = teamId.trim();
  if (!tid) return "Team ID wajib diisi.";
  if (!/^\d+$/.test(tid)) {
    return "Team ID harus angka (bukan email). Cek URL ClickUp: app.clickup.com/{team_id}/…";
  }
  return null;
}

export default function ClickUpIntegrationPage() {
  const [cfg, setCfg] = useState<ClickUpConfig | null>(null);
  const [token, setToken] = useState("");
  const [teamId, setTeamId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [offerKickoff, setOfferKickoff] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api<ClickUpConfig>("/integrations/clickup")
      .then((c) => {
        setCfg(c);
        setTeamId(c.clickup_team_id ?? "");
        setSpaceId(c.clickup_default_space_id ?? "");
        setOfferKickoff(c.clickup_offer_on_kickoff ?? true);
      })
      .catch((e) => setErr(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    const teamErr = validateTeamId(teamId);
    if (teamErr) {
      setErr(teamErr);
      return;
    }
    try {
      await api("/integrations/clickup", {
        method: "PATCH",
        body: JSON.stringify({
          clickup_api_token: token.trim() || undefined,
          clickup_team_id: teamId.trim() || null,
          clickup_default_space_id: spaceId.trim() || null,
          clickup_offer_on_kickoff: offerKickoff,
        }),
      });
      setToken("");
      setMsg("Konfigurasi ClickUp disimpan.");
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const test = async () => {
    setErr("");
    setMsg("");
    const teamErr = validateTeamId(teamId);
    if (teamErr) {
      setErr(teamErr);
      return;
    }
    if (!cfg?.has_token && !token.trim()) {
      setErr("Isi API token terlebih dahulu.");
      return;
    }
    try {
      const r = await api<{ ok: boolean; team_name?: string }>("/integrations/clickup/test", {
        method: "POST",
        body: JSON.stringify({
          clickup_api_token: token.trim() || undefined,
          clickup_team_id: teamId.trim(),
        }),
      });
      setMsg(r.team_name ? `Koneksi OK — team: ${r.team_name}` : "Koneksi OK.");
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const canTest =
    !!teamId.trim() && /^\d+$/.test(teamId.trim()) && (!!cfg?.has_token || !!token.trim());

  return (
    <>
      <p>
        <Link to="/config">← Setting</Link>
      </p>
      <h1 className="page-title">Integrasi ClickUp</h1>
      {err && <p className="error">{err}</p>}
      {msg && <p>{msg}</p>}
      <form onSubmit={save} className="card">
        <p className="text-muted">
          Status:{" "}
          <strong>{cfg?.configured ? "Siap dipakai proyek" : "Belum lengkap (token + team ID)"}</strong>
          {cfg?.has_token && " · Token tersimpan"}
        </p>
        <div className="form-row">
          <label>API token</label>
          <input
            type="password"
            autoComplete="off"
            placeholder={cfg?.has_token ? "Kosongkan jika tidak diubah" : "pk_…"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="clickup-team-id">Team ID</label>
          <input
            id="clickup-team-id"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Contoh: 12345678"
            required
          />
          <p className="text-muted form-hint">
            Angka workspace ClickUp (bukan email). Biasanya terlihat di URL setelah login.
          </p>
        </div>
        <div className="form-row">
          <label>Default space ID (opsional)</label>
          <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} />
        </div>
        <label>
          <input
            type="checkbox"
            checked={offerKickoff}
            onChange={(e) => setOfferKickoff(e.target.checked)}
          />{" "}
          Tawarkan setup ClickUp saat Kick Off
        </label>
        <div className="btn-group">
          <button type="submit" className="primary">
            Simpan
          </button>
          <button type="button" onClick={test} disabled={!canTest}>
            Test koneksi
          </button>
        </div>
      </form>
    </>
  );
}
