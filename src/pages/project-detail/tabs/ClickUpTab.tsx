import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../../../api";
import { TruncatedText } from "../../../components/TruncatedText";
import { formatClickUpSyncMessage, syncClickUpProgress } from "../../../clickupSync";
import { TabAlert, TabFormFooter } from "../shared/TabLayout";
import { TaskRecapTables } from "./milestones/taskRecap";
import type { TaskRecapGroup, TaskRecapRow } from "./milestones/taskRecap";
export function ClickUpTab({ projectId }: { projectId: number }) {
  const [recap, setRecap] = useState<{
    total: number;
    closed: number;
    open: number;
    overdue: number;
    tasks: TaskRecapRow[];
    groups?: TaskRecapGroup[];
  } | null>(null);
  const [cfg, setCfg] = useState({
    clickup_enabled: false,
    clickup_folder_id: "",
    clickup_list_id: "",
    clickup_space_id: "",
    configured: false,
    clickup_provision_status: "not_requested",
    kickoff_timeline_confirmed: false,
    sync_mode: "none" as "none" | "folder" | "legacy_list",
  });
  const [folderLists, setFolderLists] = useState<{ id: string; name: string }[]>([]);
  const [milestoneMap, setMilestoneMap] = useState<
    { milestone_id: number; name: string; clickup_list_id: string | null }[]
  >([]);
  const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfgMsgOk, setCfgMsgOk] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const load = () => api<typeof recap>(`/projects/${projectId}/tasks/recap`).then(setRecap);
  useEffect(() => {
    load().catch(() => {});
    api<{
      clickup_enabled: boolean;
      clickup_folder_id: string | null;
      clickup_list_id: string | null;
      clickup_space_id: string | null;
      configured: boolean;
      clickup_provision_status?: string;
      kickoff_timeline_confirmed?: boolean;
      sync_mode?: "none" | "folder" | "legacy_list";
    }>(`/integrations/clickup/by-project/${projectId}`)
      .then((c) => {
        setCfg({
          clickup_enabled: c.clickup_enabled,
          clickup_folder_id: c.clickup_folder_id ?? "",
          clickup_list_id: c.clickup_list_id ?? "",
          clickup_space_id: c.clickup_space_id ?? "",
          configured: c.configured,
          clickup_provision_status: c.clickup_provision_status ?? "not_requested",
          kickoff_timeline_confirmed: !!c.kickoff_timeline_confirmed,
          sync_mode: c.sync_mode ?? (c.clickup_folder_id ? "folder" : c.clickup_list_id ? "legacy_list" : "none"),
        });
      })
      .catch(() => {});
    api<{
      milestones: {
        milestone_id: number;
        name: string;
        clickup_list_id: string | null;
      }[];
    }>(`/integrations/clickup/by-project/${projectId}/milestone-list-map`)
      .then((r) => {
        setMilestoneMap(r.milestones);
        const mapped = r.milestones.some((m) => m.clickup_list_id);
        if (mapped) setLinkMode("existing");
      })
      .catch(() => {});
  }, [projectId]);

  const notify = (msg: string, ok = true) => {
    setCfgMsg(msg);
    setCfgMsgOk(ok);
  };

  const loadFolderLists = async () => {
    notify("");
    const fid = cfg.clickup_folder_id.trim();
    if (!fid) {
      notify("Isi Folder ID lalu Simpan, atau gunakan mode Struktur baru.", false);
      return;
    }
    try {
      const q = fid ? `?folder_id=${encodeURIComponent(fid)}` : "";
      const r = await api<{ lists: { id: string; name: string }[] }>(
        `/integrations/clickup/by-project/${projectId}/folder-lists${q}`,
      );
      setFolderLists(r.lists);
      notify(`Dimuat ${r.lists.length} list dari folder ClickUp.`);
    } catch (e) {
      notify(getErrorMessage(e), false);
    }
  };

  const saveMilestoneMap = async () => {
    notify("");
    try {
      await api(`/integrations/clickup/by-project/${projectId}/milestone-list-map`, {
        method: "PUT",
        body: JSON.stringify({
          mappings: milestoneMap.map((m) => ({
            milestone_id: m.milestone_id,
            clickup_list_id: m.clickup_list_id,
          })),
        }),
      });
      notify("Mapping phase ↔ list disimpan.");
    } catch (e) {
      notify(getErrorMessage(e), false);
    }
  };

  const saveClickUpCfg = async (opts?: { enable?: boolean; folderId?: string }) => {
    const folderId = (opts?.folderId ?? cfg.clickup_folder_id).trim();
    if (
      (opts?.enable ?? cfg.clickup_enabled) &&
      !folderId &&
      !cfg.clickup_list_id.trim() &&
      linkMode === "existing"
    ) {
      notify("Isi Folder ID folder existing lalu Simpan.", false);
      return false;
    }
    try {
      await api(`/integrations/clickup/by-project/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          clickup_enabled: opts?.enable ?? cfg.clickup_enabled,
          clickup_list_id: cfg.clickup_list_id.trim() || null,
          clickup_folder_id: folderId || null,
        }),
      });
      if (folderId && folderId !== cfg.clickup_folder_id) {
        setCfg((c) => ({ ...c, clickup_folder_id: folderId }));
      }
      if (opts?.enable) {
        setCfg((c) => ({ ...c, clickup_enabled: true }));
      }
      return true;
    } catch (e) {
      notify(getErrorMessage(e), false);
      return false;
    }
  };

  const sync = async () => {
    notify("");
    setSyncBusy(true);
    try {
      const r = await syncClickUpProgress(projectId);
      notify(formatClickUpSyncMessage(r));
      load();
    } catch (e) {
      notify(getErrorMessage(e), false);
    } finally {
      setSyncBusy(false);
    }
  };

  const ensureFolder = async (): Promise<string | null> => {
    notify("");
    try {
      const r = await api<{ clickup_folder_id: string; clickup_space_id: string }>(
        `/integrations/clickup/by-project/${projectId}/ensure-folder`,
        { method: "POST" },
      );
      setCfg((c) => ({
        ...c,
        clickup_folder_id: r.clickup_folder_id,
        clickup_space_id: r.clickup_space_id,
        clickup_enabled: true,
        sync_mode: "folder",
      }));
      setLinkMode("new");
      return r.clickup_folder_id;
    } catch (e) {
      notify(getErrorMessage(e), false);
      return null;
    }
  };

  const provisionClickUp = async (autoCreateLists: boolean, folderIdOverride?: string) => {
    notify("");
    if (!cfg.kickoff_timeline_confirmed) {
      notify("Konfirmasi timeline di tab Kick Off terlebih dahulu.", false);
      return;
    }
    try {
      const ok = await saveClickUpCfg({ enable: true, folderId: folderIdOverride });
      if (!ok) return;
      const q = autoCreateLists ? "?auto_create_lists=true" : "?auto_create_lists=false";
      const r = await api<{
        created_lists?: number;
        created_tasks?: number;
        created_subtasks?: number;
        skipped_milestones_no_list?: number;
        skipped?: boolean;
      }>(`/integrations/clickup/by-project/${projectId}/provision-timeline${q}`, {
        method: "POST",
      });
      const skipMs = r.skipped_milestones_no_list ?? 0;
      notify(
        r.skipped
          ? "Struktur ClickUp sudah pernah digenerate."
          : autoCreateLists
            ? `List dari timeline: ${r.created_lists ?? 0} · task milestone: ${r.created_tasks ?? 0} · subtask: ${r.created_subtasks ?? 0}.`
            : `Task milestone: ${r.created_tasks ?? 0} · subtask: ${r.created_subtasks ?? 0}${
                skipMs ? ` · ${skipMs} milestone belum punya list` : ""
              }.`,
      );
      const refreshed = await api<{
        clickup_folder_id: string | null;
        clickup_provision_status?: string;
        sync_mode?: "none" | "folder" | "legacy_list";
      }>(`/integrations/clickup/by-project/${projectId}`);
      setCfg((c) => ({
        ...c,
        clickup_folder_id: refreshed.clickup_folder_id ?? c.clickup_folder_id,
        clickup_provision_status: refreshed.clickup_provision_status ?? "provisioned",
        sync_mode: refreshed.sync_mode ?? "folder",
        clickup_enabled: true,
      }));
      const mapRefresh = await api<{
        milestones: { milestone_id: number; name: string; clickup_list_id: string | null }[];
      }>(`/integrations/clickup/by-project/${projectId}/milestone-list-map`);
      setMilestoneMap(mapRefresh.milestones);
      load();
    } catch (e) {
      notify(getErrorMessage(e), false);
    }
  };

  const createFolderAndGenerateFromTimeline = async () => {
    notify("");
    if (!cfg.kickoff_timeline_confirmed) {
      notify("Konfirmasi timeline di tab Kick Off terlebih dahulu.", false);
      return;
    }
    let folderId = cfg.clickup_folder_id.trim();
    if (!folderId) {
      const created = await ensureFolder();
      if (!created) return;
      folderId = created;
    } else {
      const ok = await saveClickUpCfg({ enable: true, folderId: folderId });
      if (!ok) return;
    }
    await provisionClickUp(true, folderId);
  };

  const mappedCount = milestoneMap.filter((m) => m.clickup_list_id).length;
  const provisionLabel =
    cfg.clickup_provision_status === "provisioned" ? "Provisioned" : cfg.clickup_provision_status;
  return (
    <div className="setup-project-page">
      <header className="card setup-project-header">
        <h2 className="card-title">ClickUp & setup delivery</h2>
        <p className="text-muted">
          Bispro: setelah <strong>Kick off OK</strong> → <strong>Project Start</strong> membuat
          timeline operasional + struktur ClickUp (folder/list/task). Sync memperbarui progress task.
        </p>
      </header>
      <TabAlert message={cfgMsg} variant={cfgMsg ? (cfgMsgOk ? "success" : "error") : undefined} />
      <div className="setup-project-grid">
        <section className="card setup-section setup-clickup-panel">
          <div className="setup-clickup-toolbar">
            <div>
              <h3 className="card-title" style={{ marginBottom: "0.25rem" }}>
                ClickUp
              </h3>
              <p className="text-muted form-hint" style={{ margin: 0 }}>
                Folder = proyek · List = phase · Task + subtask ClickUp.
              </p>
            </div>
            <div className="setup-clickup-mode" role="tablist" aria-label="Mode folder ClickUp">
              <button
                type="button"
                className={linkMode === "new" ? "is-active" : ""}
                onClick={() => setLinkMode("new")}
              >
                Struktur baru
              </button>
              <button
                type="button"
                className={linkMode === "existing" ? "is-active" : ""}
                onClick={() => setLinkMode("existing")}
              >
                Folder existing
              </button>
            </div>
          </div>
          {!cfg.configured && (
            <p className="error setup-alert">
              Integrasi org belum lengkap.{" "}
              <Link to="/config/clickup">Setting → Integrasi ClickUp</Link>
            </p>
          )}
          <div className="setup-clickup-meta">
            <span
              className={`badge ${cfg.clickup_enabled ? "badge-success" : "badge-warning"}`}
            >
              {cfg.clickup_enabled ? "ClickUp aktif" : "ClickUp nonaktif"}
            </span>
            <span className="badge badge-info">{provisionLabel}</span>
            {cfg.clickup_folder_id && (
              <span className="badge badge-indigo">Folder · {cfg.clickup_folder_id.slice(0, 8)}…</span>
            )}
            {!cfg.kickoff_timeline_confirmed && (
              <span className="badge badge-warning">Timeline Kick Off belum OK</span>
            )}
            {linkMode === "existing" && milestoneMap.length > 0 && (
              <span className="badge badge-info">
                Mapping {mappedCount}/{milestoneMap.length}
              </span>
            )}
          </div>
          <label className="setup-check">
            <input
              type="checkbox"
              checked={cfg.clickup_enabled}
              disabled={!cfg.configured}
              onChange={(e) => setCfg({ ...cfg, clickup_enabled: e.target.checked })}
            />{" "}
            Aktifkan ClickUp di proyek ini
          </label>
          <div className="setup-clickup-body">
            {linkMode === "new" ? (
              <div className="setup-clickup-steps">
                <div className="setup-clickup-step">
                  <h4>1 · Folder proyek</h4>
                  <p className="form-hint text-muted">
                    Buat folder baru di ClickUp untuk proyek ini (atau lanjut jika ID folder sudah
                    terisi dari langkah sebelumnya).
                  </p>
                  <div className="form-row">
                    <label>Folder ID</label>
                    <input
                      value={cfg.clickup_folder_id}
                      placeholder="Terisi otomatis setelah buat folder"
                      onChange={(e) =>
                        setCfg({ ...cfg, clickup_folder_id: e.target.value, sync_mode: "folder" })
                      }
                    />
                  </div>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      disabled={!cfg.configured}
                      onClick={() => void ensureFolder()}
                    >
                      Buat folder proyek
                    </button>
                  </div>
                </div>
                <div className="setup-clickup-step">
                  <h4>2 · List & task dari timeline</h4>
                  <p className="form-hint text-muted">
                    Satu <strong>list ClickUp per milestone</strong> kick off (nama mengikuti
                    timeline), lalu task container, subtask, dan checklist template.
                  </p>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={!cfg.configured || !cfg.kickoff_timeline_confirmed}
                      onClick={() => void createFolderAndGenerateFromTimeline()}
                    >
                      Buat folder &amp; generate dari timeline
                    </button>
                    <button
                      type="button"
                      disabled={!cfg.configured || !cfg.kickoff_timeline_confirmed}
                      onClick={() => void provisionClickUp(true)}
                    >
                      Generate ulang list/task
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="setup-clickup-steps">
                <div className="setup-clickup-step">
                  <h4>1 · Hubungkan folder</h4>
                  <div className="form-row">
                    <label>Folder ID (existing)</label>
                    <input
                      value={cfg.clickup_folder_id}
                      placeholder="Tempel ID folder dari ClickUp"
                      onChange={(e) =>
                        setCfg({ ...cfg, clickup_folder_id: e.target.value, sync_mode: "folder" })
                      }
                    />
                  </div>
                  <div className="setup-clickup-actions setup-clickup-actions--step">
                    <button
                      type="button"
                      disabled={!cfg.configured || !cfg.clickup_folder_id.trim()}
                      onClick={() => void loadFolderLists()}
                    >
                      Muat list
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={!cfg.configured}
                      onClick={() => void saveClickUpCfg().then((ok) => ok && notify("Folder disimpan."))}
                    >
                      Simpan folder
                    </button>
                  </div>
                </div>
                <div className="setup-clickup-step">
                  <h4>2 · Generate task di list terpilih</h4>
                  <p className="form-hint text-muted">
                    Mapping milestone ke list di panel kanan, simpan, lalu generate task (tanpa
                    membuat list baru).
                  </p>
                  <div className="setup-clickup-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={
                        !cfg.configured ||
                        !cfg.kickoff_timeline_confirmed ||
                        mappedCount === 0
                      }
                      onClick={() => void provisionClickUp(false)}
                    >
                      Generate task dari mapping
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="setup-clickup-step setup-clickup-map">
              <h4>{linkMode === "existing" ? "Mapping phase ↔ list" : "Phase timeline"}</h4>
              {milestoneMap.length === 0 ? (
                <p className="setup-clickup-map-empty">
                  Belum ada milestone kick off. Konfirmasi timeline di tab Kick Off.
                </p>
              ) : linkMode === "existing" ? (
                <>
                  {folderLists.length === 0 && (
                    <p className="setup-clickup-map-empty">Muat list dari folder untuk dropdown.</p>
                  )}
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Phase</th>
                        <th>List ClickUp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestoneMap.map((row) => (
                        <tr key={row.milestone_id}>
                          <td>
                            <TruncatedText text={row.name} title={row.name} />
                          </td>
                          <td>
                            <select
                              value={row.clickup_list_id ?? ""}
                              onChange={(e) =>
                                setMilestoneMap((prev) =>
                                  prev.map((m) =>
                                    m.milestone_id === row.milestone_id
                                      ? {
                                          ...m,
                                          clickup_list_id: e.target.value || null,
                                        }
                                      : m,
                                  ),
                                )
                              }
                            >
                              <option value="">— pilih list —</option>
                              {folderLists.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                              {row.clickup_list_id &&
                                !folderLists.some((l) => l.id === row.clickup_list_id) && (
                                  <option value={row.clickup_list_id}>
                                    List {row.clickup_list_id}
                                  </option>
                                )}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="setup-clickup-actions setup-clickup-actions--step">
                    <button type="button" className="primary" onClick={() => void saveMilestoneMap()}>
                      Simpan mapping
                    </button>
                  </div>
                </>
              ) : (
                <ul className="setup-clickup-map-empty" style={{ paddingLeft: "1.1rem", margin: 0 }}>
                  {milestoneMap.map((m) => (
                    <li key={m.milestone_id}>
                      {m.name}
                      {m.clickup_list_id ? " · list OK" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <details className="setup-clickup-legacy">
            <summary className="text-muted">Lanjutan · satu list (legacy)</summary>
            <div className="form-row">
              <label>List ID</label>
              <input
                value={cfg.clickup_list_id}
                placeholder="Hanya jika tidak pakai folder"
                onChange={(e) => setCfg({ ...cfg, clickup_list_id: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => void saveClickUpCfg().then((ok) => ok && notify("List legacy disimpan."))}
            >
              Simpan list legacy
            </button>
          </details>
          <TabFormFooter hint="Simpan folder/mapping di langkah di atas; sync menarik progress task dari ClickUp.">
            <button
              type="button"
              disabled={
                syncBusy ||
                !cfg.clickup_enabled ||
                (!cfg.clickup_folder_id.trim() && !cfg.clickup_list_id.trim())
              }
              onClick={() => void sync()}
            >
              {syncBusy ? "Sync…" : "Sync progress dari ClickUp"}
            </button>
          </TabFormFooter>
          {syncBusy && (
            <div className="sync-progress-bar" role="progressbar" aria-busy="true" aria-label="Sinkronisasi ClickUp">
              <div className="sync-progress-bar__indeterminate" />
            </div>
          )}
        </section>
      </div>
      {recap && (
        <section className="card setup-section setup-tasks-recap">
          <h3 className="card-title">Ringkasan task</h3>
          <p>
            Total <strong>{recap.total}</strong> · Open {recap.open} · Closed {recap.closed} ·
            Overdue {recap.overdue}
          </p>
          {(recap.tasks?.length ?? 0) > 0 && (
            <TaskRecapTables
              groups={recap.groups?.map((g) => ({
                ...g,
                tasks: g.tasks.slice(0, 15),
              }))}
              tasks={recap.tasks.slice(0, 30)}
            />
          )}
        </section>
      )}
    </div>
  );
}

