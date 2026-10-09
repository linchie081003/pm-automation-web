import { useEffect, useState } from "react";
import { api, getErrorMessage, previewFile } from "../../../api";
import { TabDocumentUpload } from "../../../components/TabDocumentUpload";
import { draftRowsWithParentRefs, draftTimelineRecalcPayload } from "../../../components/timeline/draftTimelinePayload";
import { formatProjectTimelineSummary, type ProjectTimelineSummary } from "../../../timelineProjectDuration";
import { toDateInputValue } from "../../../lib/formatDate";
import { newId } from "../../../lib/newId";
import { formatDraftWeightErrors, validateDraftTimelineWeight } from "../../../lib/timelineWeightValidation";
import { TAB_READONLY_MSG } from "../projectPhaseAccess";
import { OrgStructureChart } from "../orgChart/OrgStructureChart";
import { TabAlert, TabFormFooter, TabPhaseFooter, TabReadOnlyNotice } from "../shared/TabLayout";
import { DraftTimelineTable } from "../timeline/DraftTimelineEditorGrid";
import type { DraftTimelineRow } from "../timeline/draftTypes";
import { enrichDraftRowsFromServer, mergeDraftTimelineNotes, normalizeDraftSortOrder } from "../timeline/draftRowAdapter";
import { SphLineList } from "./sph/sphHelpers";
export type PreKickoffPack = {
  background: string;
  scope: string;
  non_scope: string;
  timeline_summary: string;
  org_vendor: string;
  org_client: string;
  next_activities: string;
  deliverables_items: { id?: string; text: string }[];
  draft_timeline: DraftTimelineRow[];
  draft_timeline_ready: boolean;
  estimated_start_date: string | null;
  project_timeline?: ProjectTimelineSummary;
  timeline_confirmed: boolean;
  is_complete: boolean;
};

export function PreKickoffTab({
  projectId,
  readOnly,
  onTimelineChanged,
  onProjectRefresh,
}: {
  projectId: number;
  readOnly?: boolean;
  onTimelineChanged?: () => void;
  onProjectRefresh?: () => void;
}) {
  const [pack, setPack] = useState<PreKickoffPack | null>(null);
  const [msg, setMsg] = useState("");
  const [deckModal, setDeckModal] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [draftTimeline, setDraftTimeline] = useState<DraftTimelineRow[]>([]);
  const [projectTimeline, setProjectTimeline] = useState<ProjectTimelineSummary | null>(null);
  const [estimatedStart, setEstimatedStart] = useState("");
  const textFields = ["background", "timeline_summary", "next_activities"] as const;
  const load = () =>
    api<PreKickoffPack>(`/projects/${projectId}/pre-kickoff`).then((p) => {
      setPack({
        ...p,
        deliverables_items: p.deliverables_items?.length
          ? p.deliverables_items.map((d) => ({
              id: d.id || newId(),
              text: d.text,
            }))
          : [],
      });
      setDraftTimeline(
        enrichDraftRowsFromServer(
          draftRowsWithParentRefs(
            (p.draft_timeline ?? []).map((r, idx) => ({
              id: r.id,
              row_key: r.row_key,
              name: r.name,
              duration_days: r.duration_days ?? 1,
              weight_pct: r.weight_pct ?? 0,
              start_date: r.start_date,
              target_date: r.target_date,
              item_type: r.item_type ?? "phase",
              parent_id: r.parent_id,
              parent_ref: r.parent_ref,
              sort_order: r.sort_order ?? idx,
              notes: r.notes ?? "",
              predecessor_ref: r.predecessor_ref ?? null,
              predecessor_link_type: r.predecessor_link_type ?? null,
              predecessors: r.predecessors,
            })),
          ),
        ),
      );
      setEstimatedStart(
        p.estimated_start_date ? toDateInputValue(p.estimated_start_date) : "",
      );
      setProjectTimeline(p.project_timeline ?? null);
    });
  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
  }, [projectId]);
  const save = async () => {
    if (!pack) return;
    await api(`/projects/${projectId}/pre-kickoff`, {
      method: "PUT",
      body: JSON.stringify({
        background: pack.background,
        scope: pack.scope,
        non_scope: pack.non_scope,
        timeline_summary: pack.timeline_summary,
        org_vendor: pack.org_vendor,
        org_client: pack.org_client,
        next_activities: pack.next_activities,
        deliverables_items: pack.deliverables_items
          .filter((d) => d.text.trim())
          .map(({ id, text }) => ({ id, text: text.trim() })),
      }),
    });
    setMsg("Kick Off disimpan.");
    load();
    onProjectRefresh?.();
  };
  const canEditDraft =
    !readOnly &&
    !!pack?.draft_timeline_ready &&
    !pack.timeline_confirmed &&
    draftTimeline.length > 0;

  const saveKickoffDraftTimeline = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      const recalcPayload = draftTimelineRecalcPayload(draftTimeline, estimatedStart || null);
      const res = await api<{
        draft_timeline: DraftTimelineRow[];
        project_timeline?: ProjectTimelineSummary;
      }>(`/projects/${projectId}/sph/draft-timeline`, {
        method: "PUT",
        body: JSON.stringify({
          start_date: recalcPayload.start_date,
          rows: recalcPayload.rows.map((r, idx) => ({
            ...r,
            notes: (draftTimeline[idx]?.notes ?? "").trim() || null,
          })),
        }),
      });
      setDraftTimeline(
        normalizeDraftSortOrder(
          enrichDraftRowsFromServer(
            [...mergeDraftTimelineNotes(
              draftTimeline,
              draftRowsWithParentRefs(res.draft_timeline),
            )].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
          ),
        ),
      );
      setProjectTimeline(res.project_timeline ?? null);
      setMsg("Draft timeline disimpan — tanggal dihitung ulang (kalender kerja).");
      onTimelineChanged?.();
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };

  const persistKickoffStart = async () => {
    if (!canEditDraft) return;
    await api(`/projects/${projectId}/sph`, {
      method: "PUT",
      body: JSON.stringify({ estimated_start_date: estimatedStart || null }),
    });
  };

  const confirmTimeline = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      await api(`/projects/${projectId}/pre-kickoff/confirm-timeline`, { method: "POST" });
      setMsg("Timeline dikonfirmasi — lanjut ke delivery via «Lanjut fase» di panel kesehatan.");
      onTimelineChanged?.();
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const openKickoffGenerate = async () => {
    setMsg("");
    setDeckBusy(true);
    try {
      await previewFile(`/projects/${projectId}/pre-kickoff/preview-kickoff-deck`);
      setDeckModal(true);
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setDeckBusy(false);
    }
  };
  const confirmDeckSave = async () => {
    setDeckBusy(true);
    setMsg("");
    try {
      await api(`/projects/${projectId}/pre-kickoff/generate-kickoff-deck`, { method: "POST" });
      setMsg("Deck kick off disimpan ke tab Documents.");
      setDeckModal(false);
      load();
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setDeckBusy(false);
    }
  };
  if (!pack) return <div className="card">Memuat Kick Off…</div>;

  return (
    <div className="kickoff-layout">
      <header className="kickoff-hero card">
        <div>
          <h2 className="card-title">Kick Off meeting pack</h2>
          <p className="text-muted">
            Scope dan deliverables dari SPH; timeline draft direview sebelum konfirmasi resmi.
          </p>
        </div>
        <div className="kickoff-status-pills">
          <span className={`pill ${pack.timeline_confirmed ? "pill-ok" : "pill-warn"}`}>
            Timeline {pack.timeline_confirmed ? "confirmed" : "draft review"}
          </span>
          <span className={`pill ${pack.is_complete ? "pill-ok" : "pill-neutral"}`}>
            Pack {pack.is_complete ? "lengkap" : "draft"}
          </span>
        </div>
      </header>
      {readOnly && <TabReadOnlyNotice message={TAB_READONLY_MSG.kickoff} />}
      <TabAlert message={msg} />
      <fieldset disabled={readOnly} className="kickoff-fieldset">
      <div className="kickoff-grid">
        <section className="card kickoff-section">
          <h3 className="card-title">Scope & non-scope</h3>
          <div className="form-row">
            <label>Scope (SPH SOW)</label>
            <textarea rows={4} readOnly value={pack.scope ?? ""} className="readonly-block" />
          </div>
          <div className="form-row">
            <label>Non scope</label>
            <textarea rows={3} readOnly value={pack.non_scope ?? ""} className="readonly-block" />
          </div>
        </section>
        <section className="card kickoff-section">
          <h3 className="card-title">Ringkasan</h3>
          {textFields.map((f) => (
            <div className="form-row" key={f}>
              <label>{f.replace(/_/g, " ")}</label>
              <textarea
                rows={2}
                value={pack[f] ?? ""}
                onChange={(e) => setPack({ ...pack, [f]: e.target.value })}
              />
            </div>
          ))}
        </section>
      </div>
      <div className="kickoff-org-grid">
        <section className="card kickoff-section">
          <h3 className="card-title">Organisasi Vendor</h3>
          <textarea
            rows={6}
            className="org-editor"
            value={pack.org_vendor ?? ""}
            placeholder={"PM — Nama\n  Tech Lead — Nama\n  Engineer — Nama"}
            onChange={(e) => setPack({ ...pack, org_vendor: e.target.value })}
          />
          <OrgStructureChart title="Struktur organisasi (top-down)" raw={pack.org_vendor ?? ""} />
        </section>
        <section className="card kickoff-section">
          <h3 className="card-title">Organisasi Klien</h3>
          <textarea
            rows={6}
            className="org-editor"
            value={pack.org_client ?? ""}
            placeholder={"Project Owner — Nama\n  Business SME — Nama"}
            onChange={(e) => setPack({ ...pack, org_client: e.target.value })}
          />
          <OrgStructureChart title="Struktur organisasi (top-down)" raw={pack.org_client ?? ""} />
        </section>
      </div>
      <section className="card kickoff-section">
      <h3 className="card-title">Deliverables</h3>
      <SphLineList
        items={pack.deliverables_items.map((d) => ({ id: d.id!, text: d.text }))}
        setItems={(items) =>
          setPack({
            ...pack,
            deliverables_items: items.map((i) => ({ id: i.id, text: i.text })),
          })
        }
        placeholder="Deliverable..."
      />
      </section>
      <section className="card kickoff-section ui-section">
        <h3 className="card-title">Draft timeline Kick Off</h3>
        <p className="text-muted ui-section__desc">
          Muncul setelah SPH selesai («Lanjut ke Kick Off»). Mekanisme sama tab SPH: estimasi mulai,
          hitung ulang otomatis, durasi/bobot/predecessor, simpan draft — lalu konfirmasi sebelum
          delivery.
        </p>
        {!pack.draft_timeline_ready ? (
          <p className="text-muted">
            Belum tersedia — lengkapi SPH + draft + termin, lalu tombol{" "}
            <strong>Lanjut ke fase berikutnya «Kick Off»</strong> di tab SPH.
          </p>
        ) : (
          <>
            <div className="form-grid-2">
              <div className="form-row">
                <label htmlFor="ko-start">Estimasi mulai proyek</label>
                <input
                  id="ko-start"
                  type="date"
                  disabled={!canEditDraft}
                  value={estimatedStart}
                  onChange={(e) => setEstimatedStart(e.target.value)}
                  onBlur={() => {
                    persistKickoffStart()
                      .then(() =>
                        draftTimeline.length > 0 ? saveKickoffDraftTimeline() : undefined,
                      )
                      .catch((e) => setMsg(getErrorMessage(e)));
                  }}
                />
              </div>
              <div className="form-row">
                <label>Durasi aktual dari timeline</label>
                {formatProjectTimelineSummary(projectTimeline) ? (
                  <p className="text-muted" style={{ margin: 0, fontSize: "0.95rem" }}>
                    <strong>{formatProjectTimelineSummary(projectTimeline)}</strong>
                  </p>
                ) : (
                  <p className="text-muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                    — muncul setelah baris punya tanggal (simpan / hitung ulang)
                  </p>
                )}
              </div>
            </div>
            <DraftTimelineTable
              canEdit={canEditDraft}
              projectId={projectId}
              timelineStart={estimatedStart || null}
              draftTimeline={draftTimeline}
              setDraftTimeline={setDraftTimeline}
              projectTimeline={projectTimeline}
              onProjectTimelineChange={setProjectTimeline}
              onSave={saveKickoffDraftTimeline}
            />
            {!pack.timeline_confirmed && draftTimeline.length > 0 && (
              <TabPhaseFooter hint="Setelah konfirmasi, lanjut fase via panel kesehatan proyek di atas.">
                <button
                  type="button"
                  className="primary btn-phase-advance"
                  onClick={confirmTimeline}
                >
                  Konfirmasi timeline (Kick Off OK)
                </button>
              </TabPhaseFooter>
            )}
            {pack.timeline_confirmed && (
              <p className="text-muted tab-phase-footer__hint">
                Timeline sudah dikonfirmasi — gunakan «Lanjut fase → Project Start» di panel
                kesehatan proyek jika pack lengkap.
              </p>
            )}
          </>
        )}
      </section>
      <TabFormFooter hint="Ringkasan organisasi, deliverables, dan teks pack Kick Off.">
        <button type="button" disabled={deckBusy} onClick={openKickoffGenerate}>
          Generate kickoff deck
        </button>
        <button type="button" className="primary" onClick={save}>
          Simpan pack
        </button>
      </TabFormFooter>
      </fieldset>
      <TabDocumentUpload
        projectId={projectId}
        docType="mom"
        phase="pre_kickoff"
        title="Dokumen Kick Off"
        hint="MoM, materi presentasi, atau lampiran kick off meeting."
        readOnly={readOnly}
      />
      {deckModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2 className="card-title">Generate kickoff deck</h2>
            <p className="text-muted">
              File dibuka / diunduh untuk dicek. Jika OK, simpan ke tab <strong>DOCUMENTS</strong>.
            </p>
            <div className="btn-group">
              <button
                type="button"
                className="primary"
                disabled={deckBusy}
                onClick={confirmDeckSave}
              >
                OK — Simpan ke Documents
              </button>
              <button type="button" disabled={deckBusy} onClick={() => setDeckModal(false)}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

