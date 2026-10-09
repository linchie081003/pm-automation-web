import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../../api";
import { useAuth } from "../../../../auth";
import { TabAlert, TabFormFooter } from "../../shared/TabLayout";
export function ProjectRagConfig({ projectId }: { projectId: number }) {
  const { can } = useAuth();
  const canEdit = can("health.config.write");
  const [cfg, setCfg] = useState({
    spi_green_min: "1",
    spi_yellow_min: "0.9",
    progress_gap_green_max: "5",
    progress_gap_yellow_max: "15",
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{
      spi_green_min: number;
      spi_yellow_min: number;
      progress_gap_green_max: number;
      progress_gap_yellow_max: number;
    }>(`/projects/${projectId}/health/config`)
      .then((c) =>
        setCfg({
          spi_green_min: String(c.spi_green_min),
          spi_yellow_min: String(c.spi_yellow_min),
          progress_gap_green_max: String(c.progress_gap_green_max),
          progress_gap_yellow_max: String(c.progress_gap_yellow_max),
        }),
      )
      .catch(() => {});
  }, [projectId]);
  const msgOk = msg === "Ambang RAG & SPI disimpan.";
  const save = async () => {
    if (!canEdit) return;
    setMsg("");
    try {
      await api(`/projects/${projectId}/health/config`, {
        method: "PATCH",
        body: JSON.stringify({
          spi_green_min: Number(cfg.spi_green_min),
          spi_yellow_min: Number(cfg.spi_yellow_min),
          progress_gap_green_max: Number(cfg.progress_gap_green_max),
          progress_gap_yellow_max: Number(cfg.progress_gap_yellow_max),
        }),
      });
      setMsg("Ambang RAG & SPI disimpan.");
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <section className="reports-rag-section" aria-labelledby="reports-rag-heading">
      <h2 id="reports-rag-heading" className="subsection-title">
        Ambang RAG & SPI
      </h2>
      <p className="text-muted form-hint reports-rag-section__lead">
        Ambang hijau / kuning untuk status RAG di panel kesehatan proyek, tabel S-curve di bawah, dan
        weekly report. SPI = progress actual ÷ target (planned) pada periode snapshot.
      </p>
      <TabAlert message={msg} variant={msg ? (msgOk ? "success" : "error") : undefined} />
      {!canEdit && (
        <TabAlert
          message="Tampilan ambang saat ini (read-only). Ubah nilai membutuhkan izin health.config.write."
          variant="info"
        />
      )}
      <div className="reports-rag-layout">
        <div className="reports-rag-panel sph-info-panel">
          <h3 className="sph-info-panel__title">SPI (Schedule Performance Index)</h3>
          <p className="form-hint reports-rag-panel__hint">
            Semakin tinggi SPI, semakin dekat actual dengan rencana.
          </p>
          <div className="sph-info-grid">
            <div className="form-row">
              <label htmlFor="rag-spi-green">Minimum SPI — Green</label>
              <input
                id="rag-spi-green"
                type="number"
                step="0.01"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.spi_green_min}
                onChange={(e) => setCfg({ ...cfg, spi_green_min: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="rag-spi-yellow">Minimum SPI — Yellow</label>
              <input
                id="rag-spi-yellow"
                type="number"
                step="0.01"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.spi_yellow_min}
                onChange={(e) => setCfg({ ...cfg, spi_yellow_min: e.target.value })}
              />
            </div>
          </div>
          <ul className="plain reports-rag-rules">
            <li>
              <span className="rag rag-green">Green</span> jika SPI ≥ minimum Green
            </li>
            <li>
              <span className="rag rag-yellow">Yellow</span> jika SPI ≥ minimum Yellow (dan &lt; Green)
            </li>
            <li>
              <span className="rag rag-red">Red</span> jika SPI &lt; minimum Yellow
            </li>
          </ul>
        </div>
        <div className="reports-rag-panel sph-info-panel">
          <h3 className="sph-info-panel__title">Deviasi progress (%)</h3>
          <p className="form-hint reports-rag-panel__hint">
            Selisih actual − target; dipakai sebagai penunjang RAG bila SPI tidak tersedia.
          </p>
          <div className="sph-info-grid">
            <div className="form-row">
              <label htmlFor="rag-gap-green">Maks. deviasi — Green (%)</label>
              <input
                id="rag-gap-green"
                type="number"
                step="0.1"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.progress_gap_green_max}
                onChange={(e) => setCfg({ ...cfg, progress_gap_green_max: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="rag-gap-yellow">Maks. deviasi — Yellow (%)</label>
              <input
                id="rag-gap-yellow"
                type="number"
                step="0.1"
                className="sph-info-input"
                disabled={!canEdit}
                value={cfg.progress_gap_yellow_max}
                onChange={(e) => setCfg({ ...cfg, progress_gap_yellow_max: e.target.value })}
              />
            </div>
          </div>
          <ul className="plain reports-rag-rules">
            <li>
              <span className="rag rag-green">Green</span> jika |deviasi| ≤ ambang Green
            </li>
            <li>
              <span className="rag rag-yellow">Yellow</span> jika |deviasi| ≤ ambang Yellow
            </li>
            <li>
              <span className="rag rag-red">Red</span> di luar ambang Yellow
            </li>
          </ul>
        </div>
      </div>
      {canEdit && (
        <TabFormFooter>
          <button type="button" className="primary" onClick={() => void save()} disabled={!canEdit}>
            Simpan ambang RAG & SPI
          </button>
        </TabFormFooter>
      )}
    </section>
  );
}

