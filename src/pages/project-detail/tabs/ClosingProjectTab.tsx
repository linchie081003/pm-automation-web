import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { newId } from "../../../lib/newId";
import type { ProjectDetail } from "../projectDetailTypes";
import { TabAlert, TabFormFooter } from "../shared/TabLayout";
export type BastCriterion = { id: string; label: string; done: boolean };

export function parseBastItems(raw: Record<string, unknown>): BastCriterion[] {
  const items = raw?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it, index) => {
      if (!it || typeof it !== "object") return null;
      const o = it as { id?: string; label?: string; done?: boolean };
      const label = (o.label ?? "").trim();
      if (!label) return null;
      return {
        id: o.id ?? `bast-${index}`,
        label,
        done: Boolean(o.done),
      };
    })
    .filter((x): x is BastCriterion => x !== null);
}

export function ClosingProjectTab({
  projectId,
  detail,
  checklist,
  onSaved,
}: {
  projectId: number;
  detail: ProjectDetail;
  checklist: Record<string, unknown>;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<BastCriterion[]>(() => parseBastItems(checklist));
  const [newLabel, setNewLabel] = useState("");
  const [msg, setMsg] = useState("");
  const progress = detail.health?.actual_progress_pct ?? 0;
  const isClosed = detail.status === "closed" || detail.current_phase === "closed";

  useEffect(() => {
    setItems(parseBastItems(checklist));
  }, [checklist]);

  const addCriterion = () => {
    const label = newLabel.trim();
    if (!label) return;
    setItems([
      ...items,
      { id: newId(), label, done: false },
    ]);
    setNewLabel("");
  };

  const removeCriterion = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const allDone = items.length > 0 && items.every((i) => i.done);
  const canClose = allDone && progress >= 100 && !isClosed;

  const closeProject = async () => {
    setMsg("");
    try {
      await saveChecklistSilent();
      await api(`/projects/${projectId}/close`, { method: "POST" });
      setMsg("Proyek ditandai sebagai closed / completed.");
      onSaved();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  const saveChecklistSilent = async () => {
    await api(`/projects/${projectId}/bast`, {
      method: "PATCH",
      body: JSON.stringify({
        bast_checklist: {
          items: items.map(({ id, label, done }) => ({ id, label, done })),
        },
      }),
    });
  };

  const save = async () => {
    setMsg("");
    try {
      await saveChecklistSilent();
      setMsg("Checklist BAST disimpan.");
      onSaved();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Closing project</h2>
      {isClosed && (
        <p>
          Status: <span className="badge badge-indigo">Closed / Completed</span>
        </p>
      )}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Progress actual</div>
          <div className="kpi-value">{progress}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Checklist BAST</div>
          <div className="kpi-value">
            {items.filter((i) => i.done).length}/{items.length}
          </div>
        </div>
      </div>
      <p className="text-muted">
        Checklist default: <strong>Data PO lengkap (BAST)</strong> dan{" "}
        <strong>Progress Proyek 100%</strong>. Syarat yang sama berlaku sebelum lanjut ke fase BAST
        (ditambah minimal 1 weekly report). Closing: centang semua kriteria, progress 100%, PO
        lengkap.
      </p>
      <TabAlert message={msg} />
      {items.length === 0 ? (
        <p className="text-muted">Belum ada kriteria.</p>
      ) : (
        <ul className="plain bast-list">
          {items.map((item) => (
            <li key={item.id} className="bast-row">
              <label className="bast-check">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) =>
                    setItems(
                      items.map((i) =>
                        i.id === item.id ? { ...i, done: e.target.checked } : i,
                      ),
                    )
                  }
                />
                <span>{item.label}</span>
              </label>
              <button
                type="button"
                className="danger-link"
                onClick={() => removeCriterion(item.id)}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
      {allDone && (
        <p className="text-muted" style={{ color: "var(--color-success-text)" }}>
          Semua kriteria terpenuhi — siap untuk gate closing.
        </p>
      )}
      <div className="form-row" style={{ marginTop: "1rem" }}>
        <label htmlFor="bast-new">Kriteria baru</label>
        <input
          id="bast-new"
          value={newLabel}
          placeholder="Contoh: BAST ditandatangani klien"
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCriterion();
            }
          }}
        />
      </div>
      <TabFormFooter hint="Checklist BAST; tutup proyek setelah semua kriteria terpenuhi.">
        <button type="button" onClick={addCriterion}>
          Tambah kriteria
        </button>
        <button type="button" onClick={save}>
          Simpan checklist
        </button>
        <button
          type="button"
          className="primary btn-phase-advance"
          disabled={!canClose}
          onClick={closeProject}
          title={
            !canClose
              ? "Lengkapi checklist, progress 100%, dan proyek belum closed"
              : undefined
          }
        >
          Tutup proyek (Closed)
        </button>
      </TabFormFooter>
      {!canClose && !isClosed && (
        <p className="text-muted" style={{ marginTop: "0.75rem" }}>
          {progress < 100 && "Progress belum 100%. "}
          {!allDone && "Checklist BAST belum lengkap. "}
        </p>
      )}
    </div>
  );
}
