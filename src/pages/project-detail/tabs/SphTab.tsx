import { FormEvent, useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { TabDocumentUpload } from "../../../components/TabDocumentUpload";
import { draftRowsWithParentRefs, draftTimelineRecalcPayload } from "../../../components/timeline/draftTimelinePayload";
import { formatProjectTimelineSummary, type ProjectTimelineSummary } from "../../../timelineProjectDuration";
import { formatDisplayDate, toDateInputValue } from "../../../lib/formatDate";
import { newId } from "../../../lib/newId";
import { formatDraftWeightErrors, validateDraftTimelineWeight } from "../../../lib/timelineWeightValidation";
import { TAB_READONLY_MSG } from "../projectPhaseAccess";
import { TabAlert, TabFormFooter, TabPhaseFooter, TabReadOnlyNotice } from "../shared/TabLayout";
import { formatRupiah, formatRupiahDigits, parseRupiahDigits } from "../shared/moneyFormat";
import { DraftTimelineTable } from "../timeline/DraftTimelineEditorGrid";
import type { DraftTimelineRow } from "../timeline/draftTypes";
import { enrichDraftRowsFromServer, mergeDraftTimelineNotes, normalizeDraftSortOrder } from "../timeline/draftRowAdapter";
import {
  DeliveryItemRow,
  LineItemRow,
  PaymentTermRow,
  SphLineList,
  mapPaymentTermsFromApi,
  syncPaymentTermsFromDraft,
} from "./sph/sphHelpers";
export function SphTab({
  projectId,
  projectMethodology,
  timelineEditable,
  readOnlyPhase,
  onMethodologyChange,
  onDraftTimelineChanged,
  onAdvanceToKickOff,
  onProjectRefresh,
}: {
  projectId: number;
  projectMethodology: string;
  timelineEditable: boolean;
  readOnlyPhase?: boolean;
  onMethodologyChange?: () => void;
  onDraftTimelineChanged?: () => void;
  onAdvanceToKickOff?: () => void;
  onProjectRefresh?: () => void;
}) {
  const [form, setForm] = useState({
    sph_no: "",
    sph_name: "",
    sph_client: "",
    sales_pic: "",
    estimated_start_date: "",
    target_delivery_days: "",
    delivery_method: "",
    pic_user_name: "",
    pic_user_contact: "",
    planned_md: "",
  });
  const [isComplete, setIsComplete] = useState(false);
  const [draftTimeline, setDraftTimeline] = useState<DraftTimelineRow[]>([]);
  const [projectTimeline, setProjectTimeline] = useState<ProjectTimelineSummary | null>(null);
  const [sphReadOnly, setSphReadOnly] = useState(false);
  const canEditSph = timelineEditable && !sphReadOnly && !readOnlyPhase;
  const [templates, setTemplates] = useState<
    { id: number; name: string; methodology: string }[]
  >([]);
  const [timelineTemplateId, setTimelineTemplateId] = useState("");
  const [methodology, setMethodology] = useState(projectMethodology);
  const [scopeItems, setScopeItems] = useState<LineItemRow[]>([]);
  const [nonScopeText, setNonScopeText] = useState("");
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItemRow[]>([]);
  const [sphTotal, setSphTotal] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermRow[]>([]);
  const [projectBrief, setProjectBrief] = useState("");
  const [msg, setMsg] = useState("");
  const load = () =>
    api<{
      sph_no: string | null;
      sph_name: string | null;
      sph_client: string | null;
      sales_pic: string | null;
      estimated_start_date: string | null;
      target_delivery_days: number | null;
      scope_text: string;
      non_scope_text: string;
      scope_items: { id?: string; module?: string; text: string }[];
      non_scope_items: { id?: string; text: string }[];
      delivery_items: { id?: string; name: string; amount_rupiah: number }[];
      sph_total_rupiah: number | null;
      delivery_method: string;
      pic_user_name: string;
      pic_user_contact: string;
      planned_md: number | null;
      timeline_template_id: number | null;
      draft_timeline: DraftTimelineRow[];
      project_timeline?: ProjectTimelineSummary;
      is_complete: boolean;
      draft_baseline_generated_at?: string | null;
      payment_terms: {
        label?: string;
        due_date?: string | null;
        percent_pct?: number | null;
        amount?: number | null;
        draft_milestone_id?: number | null;
      }[];
    }>(`/projects/${projectId}/sph`).then((s) => {
      setIsComplete(!!s.is_complete);
      setSphReadOnly(!!s.draft_baseline_generated_at);
      const rawDraft = (s.draft_timeline ?? []).map((r, idx) => ({
        ...r,
        duration_days: r.duration_days ?? 1,
        item_type: r.item_type ?? "phase",
        sort_order: r.sort_order ?? idx,
      }));
      setDraftTimeline(enrichDraftRowsFromServer(draftRowsWithParentRefs(rawDraft)));
      setProjectTimeline(s.project_timeline ?? null);
      setTimelineTemplateId(
        s.timeline_template_id != null ? String(s.timeline_template_id) : "",
      );
      setForm({
        sph_no: s.sph_no ?? "",
        sph_name: s.sph_name ?? "",
        sph_client: s.sph_client ?? "",
        sales_pic: s.sales_pic ?? "",
        estimated_start_date: toDateInputValue(s.estimated_start_date),
        target_delivery_days: s.target_delivery_days?.toString() ?? "",
        delivery_method: s.delivery_method ?? "",
        pic_user_name: s.pic_user_name ?? "",
        pic_user_contact: s.pic_user_contact ?? "",
        planned_md: s.planned_md?.toString() ?? "",
      });
      const toLines = (
        items: { id?: string; module?: string; text: string }[],
        fallback: string,
        withModule?: boolean,
      ) => {
        if (items?.length) {
          return items.map((i) => ({
            id: i.id || newId(),
            text: i.text,
            ...(withModule ? { module: i.module ?? "" } : {}),
          }));
        }
        if (fallback.trim()) {
          return fallback
            .split("\n")
            .map((line) => line.replace(/^-\s*/, "").trim())
            .filter(Boolean)
            .map((text) => ({ id: newId(), text }));
        }
        return [];
      };
      setScopeItems(toLines(s.scope_items ?? [], s.scope_text ?? "", true));
      if ((s.non_scope_text ?? "").trim()) {
        setNonScopeText(s.non_scope_text ?? "");
      } else {
        setNonScopeText(
          (s.non_scope_items ?? [])
            .map((i) => (i.text ?? "").trim())
            .filter(Boolean)
            .join("\n"),
        );
      }
      setDeliveryItems(
        (s.delivery_items ?? []).map((d) => ({
          id: d.id || newId(),
          name: d.name,
          amount_rupiah: formatRupiahDigits(d.amount_rupiah ?? 0),
        })),
      );
      setSphTotal(s.sph_total_rupiah ?? 0);
      setPaymentTerms(mapPaymentTermsFromApi(s.payment_terms ?? []));
    });
  useEffect(() => {
    api<{ project_brief?: string | null }>(`/projects/${projectId}`)
      .then((p) => setProjectBrief(p.project_brief ?? ""))
      .catch(() => setProjectBrief(""));
  }, [projectId]);

  useEffect(() => {
    setMethodology(projectMethodology);
  }, [projectMethodology]);
  useEffect(() => {
    load().catch((e) => setMsg(getErrorMessage(e)));
    api<typeof templates>(`/timeline-templates?methodology=${methodology}`)
      .then(setTemplates)
      .catch(() => {});
  }, [projectId, methodology]);
  const saveMethodology = async (value: string) => {
    setMethodology(value);
    await api(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ methodology: value }),
    });
    onMethodologyChange?.();
  };
  const saveDraftTimeline = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      const recalcPayload = draftTimelineRecalcPayload(
        draftTimeline,
        form.estimated_start_date || null,
      );
      const res = await api<{
        draft_timeline: DraftTimelineRow[];
        project_timeline?: ProjectTimelineSummary;
        payment_terms?: {
          label?: string;
          due_date?: string | null;
          percent_pct?: number | null;
          draft_milestone_id?: number | null;
          draft_milestone_row_key?: string | null;
        }[];
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
      const mappedDraft = normalizeDraftSortOrder(
        enrichDraftRowsFromServer(
          [...mergeDraftTimelineNotes(
            draftTimeline,
            draftRowsWithParentRefs(res.draft_timeline),
          )].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        ),
      );
      setDraftTimeline(mappedDraft);
      setProjectTimeline(res.project_timeline ?? null);
      if (res.payment_terms !== undefined) {
        setPaymentTerms(mapPaymentTermsFromApi(res.payment_terms));
      } else if (
        paymentTerms.some((t) => t.draft_milestone_id || t.draft_milestone_row_key)
      ) {
        setPaymentTerms(syncPaymentTermsFromDraft(mappedDraft, paymentTerms));
      }
      setMsg("Draft timeline disimpan. Termin ter-map ikut diperbarui.");
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      await api(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ project_brief: projectBrief.trim() || null }),
      });
      await api(`/projects/${projectId}/sph`, {
        method: "PUT",
        body: JSON.stringify({
          sph_no: form.sph_no.trim() || null,
          sph_name: form.sph_name.trim() || null,
          sph_client: form.sph_client.trim() || null,
          sales_pic: form.sales_pic.trim() || null,
          estimated_start_date: form.estimated_start_date || null,
          target_delivery_days: form.target_delivery_days
            ? Number(form.target_delivery_days)
            : null,
          scope_items: scopeItems
            .filter((i) => i.text.trim())
            .map(({ id, text, module }) => ({
              id,
              module: (module ?? "").trim(),
              text: text.trim(),
            })),
          non_scope_text: nonScopeText.trim() || null,
          delivery_items: deliveryItems
            .filter((i) => i.name.trim())
            .map(({ id, name, amount_rupiah }) => ({
              id,
              name: name.trim(),
              amount_rupiah: parseRupiahDigits(amount_rupiah),
            })),
          delivery_method: form.delivery_method,
          pic_user_name: form.pic_user_name,
          pic_user_contact: form.pic_user_contact,
          planned_md: form.planned_md ? Number(form.planned_md) : null,
          timeline_template_id: timelineTemplateId ? Number(timelineTemplateId) : null,
        }),
      });
      setMsg("SPH disimpan.");
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const savePaymentTerms = async () => {
    setMsg("");
    try {
      await api(`/projects/${projectId}/sph/payment-terms`, {
        method: "PUT",
        body: JSON.stringify({
          payment_terms: paymentTerms.map((t) => ({
            label: t.label.trim(),
            due_date: t.due_date || null,
            percent_pct: t.percent_pct !== "" ? Number(t.percent_pct) : null,
            draft_milestone_id: t.draft_milestone_id
              ? Number(t.draft_milestone_id)
              : null,
            draft_milestone_row_key: t.draft_milestone_row_key.trim() || null,
          })),
        }),
      });
      setMsg("Termin pembayaran disimpan.");
      load();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const addPaymentTerm = () => {
    setPaymentTerms([
      ...paymentTerms,
      {
        label: "",
        due_date: "",
        percent_pct: "",
        draft_milestone_id: "",
        draft_milestone_row_key: "",
      },
    ]);
  };
  const removePaymentTerm = (index: number) => {
    setPaymentTerms(paymentTerms.filter((_, i) => i !== index));
  };
  const deliveryTotal = deliveryItems.reduce(
    (sum, row) => sum + parseRupiahDigits(row.amount_rupiah),
    0,
  );
  const termAmount = (percent: string) => {
    const base = sphTotal || deliveryTotal;
    const p = Number(percent);
    if (!base || !p) return "—";
    return formatRupiah(Math.round((base * p) / 100));
  };
  const hasTimelineStart = !!form.estimated_start_date.trim();
  const persistTimelinePlanning = async () => {
    if (!canEditSph) return;
    const targetDays = form.target_delivery_days
      ? Number(form.target_delivery_days)
      : null;
    await api(`/projects/${projectId}/sph`, {
      method: "PUT",
      body: JSON.stringify({
        estimated_start_date: form.estimated_start_date || null,
        target_delivery_days: targetDays,
        timeline_template_id: timelineTemplateId ? Number(timelineTemplateId) : null,
      }),
    });
  };
  const generateDraftFromTemplate = async () => {
    setMsg("");
    if (!hasTimelineStart) {
      setMsg("[Data tidak valid] Isi estimasi mulai proyek di bagian timeline terlebih dahulu.");
      return;
    }
    try {
      await persistTimelinePlanning();
      await api(`/projects/${projectId}/sph/generate-draft-timeline`, {
        method: "POST",
        body: JSON.stringify({
          start_date: form.estimated_start_date,
          timeline_template_id: timelineTemplateId ? Number(timelineTemplateId) : null,
        }),
      });
      setMsg(
        form.target_delivery_days
          ? `Draft timeline dibuat — durasi disesuaikan ke target ${form.target_delivery_days} hari kerja (phase root).`
          : "Draft timeline dari template dibuat. Isi durasi target lalu generate ulang jika perlu skala total proyek.",
      );
      load();
      onDraftTimelineChanged?.();
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  const finalizeTimelineForKickoff = async () => {
    setMsg("");
    const weightErr = formatDraftWeightErrors(
      validateDraftTimelineWeight(draftRowsWithParentRefs(draftTimeline)),
    );
    if (weightErr) {
      setMsg(weightErr);
      return;
    }
    try {
      await api<{ current_phase?: string }>(
        `/projects/${projectId}/sph/generate-timeline`,
        { method: "POST" },
      );
      setMsg("Fase Kick Off — timeline draft tersedia di tab Kick Off. SPH hanya baca.");
      load();
      onProjectRefresh?.();
      onAdvanceToKickOff?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card card--sph">
      <h2 className="card-title">SPH & PO</h2>
      <TabAlert message={msg} />
      {!canEditSph && <TabReadOnlyNotice message={TAB_READONLY_MSG.sph} />}
      <form onSubmit={save}>
        <fieldset disabled={!canEditSph} className="sph-fieldset">
        <section className="sph-info-panel" aria-labelledby="sph-info-heading">
          <h3 id="sph-info-heading" className="sph-info-panel__title">
            Informasi SPH
          </h3>
          <div className="sph-info-grid">
            <div className="form-row sph-info-grid__full">
              <label htmlFor="sph-no">No SPH</label>
              <input
                id="sph-no"
                className="sph-info-input"
                value={form.sph_no}
                onChange={(e) => setForm({ ...form, sph_no: e.target.value })}
              />
            </div>
            <div className="form-row sph-info-grid__full">
              <label htmlFor="project-brief">Project brief</label>
              <textarea
                id="project-brief"
                className="sph-info-input"
                rows={4}
                placeholder="Ringkasan proyek untuk overview laporan (weekly report PPTX)"
                value={projectBrief}
                onChange={(e) => setProjectBrief(e.target.value)}
              />
              <p className="form-hint" style={{ margin: "0.35rem 0 0" }}>
                Dipakai di halaman Overview PPTX. Jika kosong, sistem memakai scope SPH.
              </p>
            </div>
            <div className="form-row">
              <label htmlFor="sph-name">SPH name</label>
              <input
                id="sph-name"
                className="sph-info-input"
                value={form.sph_name}
                onChange={(e) => setForm({ ...form, sph_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-client">Klien name</label>
              <input
                id="sph-client"
                className="sph-info-input"
                value={form.sph_client}
                onChange={(e) => setForm({ ...form, sph_client: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sales-pic">Sales PIC</label>
              <input
                id="sales-pic"
                className="sph-info-input"
                value={form.sales_pic}
                onChange={(e) => setForm({ ...form, sales_pic: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-delivery_method">Delivery method</label>
              <input
                id="sph-delivery_method"
                className="sph-info-input"
                value={form.delivery_method}
                onChange={(e) => setForm({ ...form, delivery_method: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-pic_user_name">PIC name</label>
              <input
                id="sph-pic_user_name"
                className="sph-info-input"
                value={form.pic_user_name}
                onChange={(e) => setForm({ ...form, pic_user_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-pic_user_contact">PIC contact</label>
              <input
                id="sph-pic_user_contact"
                className="sph-info-input"
                value={form.pic_user_contact}
                onChange={(e) => setForm({ ...form, pic_user_contact: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="sph-planned_md">Planned MD (SPH)</label>
              <input
                id="sph-planned_md"
                className="sph-info-input"
                inputMode="numeric"
                value={form.planned_md}
                onChange={(e) => setForm({ ...form, planned_md: e.target.value })}
              />
            </div>
          </div>
        </section>
        <h3 className="subsection-title">Scope of work (SOW)</h3>
        <SphLineList
          items={scopeItems}
          setItems={setScopeItems}
          placeholder="Use case / item scope..."
          showModule
        />
        <section className="sph-non-scope" aria-labelledby="sph-non-scope-heading">
          <div className="sph-non-scope__header">
            <div>
              <h3 id="sph-non-scope-heading" className="subsection-title sph-non-scope__title">
                Non scope
              </h3>
              <p className="text-muted sph-non-scope__lead">
                Di luar SOW — satu baris per poin; gunakan baris kosong untuk memisahkan paragraf.
              </p>
            </div>
            <span className="sph-non-scope__meta" aria-live="polite">
              {nonScopeText.split(/\r?\n/).filter((l) => l.trim()).length} poin
            </span>
          </div>
          <div className="sph-non-scope__body">
            <textarea
              className="sph-scope-textarea"
              rows={8}
              value={nonScopeText}
              placeholder={
                "• Upgrade infrastruktur di lingkungan klien\n• Lisensi pihak ketiga di luar paket SPH\n• …"
              }
              onChange={(e) => setNonScopeText(e.target.value)}
            />
          </div>
        </section>
        <h3 className="subsection-title">Item delivery</h3>
        <p className="text-muted">Total SPH dihitung dari jumlah nilai item delivery.</p>
        <div className="sph-list-panel">
          {deliveryItems.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "3rem" }}>#</th>
                  <th>Item delivery</th>
                  <th style={{ width: "12rem" }}>Nilai (Rp)</th>
                  <th style={{ width: "3rem" }} />
                </tr>
              </thead>
              <tbody>
                {deliveryItems.map((row, index) => (
                  <tr key={row.id}>
                    <td className="text-muted">{index + 1}</td>
                    <td>
                      <input
                        className="sph-inline-input"
                        value={row.name}
                        placeholder="Nama item / deliverable"
                        onChange={(e) => {
                          const next = [...deliveryItems];
                          next[index] = { ...next[index], name: e.target.value };
                          setDeliveryItems(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="sph-inline-input"
                        inputMode="numeric"
                        value={row.amount_rupiah}
                        placeholder="0"
                        onChange={(e) => {
                          const next = [...deliveryItems];
                          next[index] = {
                            ...next[index],
                            amount_rupiah: formatRupiahDigits(parseRupiahDigits(e.target.value)),
                          };
                          setDeliveryItems(next);
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        aria-label="Hapus"
                        onClick={() =>
                          setDeliveryItems(deliveryItems.filter((_, i) => i !== index))
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            className="btn-add-row"
            onClick={() =>
              setDeliveryItems([
                ...deliveryItems,
                { id: newId(), name: "", amount_rupiah: "" as string },
              ])
            }
          >
            + Tambah item delivery
          </button>
          <p className="sph-total-line">
            Total SPH: <strong>{formatRupiah(sphTotal || deliveryTotal)}</strong>
          </p>
        </div>
        <TabFormFooter hint="Menyimpan identitas SPH, scope, non scope, dan item delivery.">
          <button type="submit" className="primary">
            Simpan SPH
          </button>
        </TabFormFooter>
        </fieldset>
      </form>
      <hr className="card-divider" />
      <section className="ui-section" aria-labelledby="sph-timeline-heading">
        <div className="ui-section__head">
          <h3 id="sph-timeline-heading" className="ui-section__title">
            Timeline (template & draft)
          </h3>
          <p className="ui-section__desc">
            Durasi hari kerja; baris dijadwalkan dari estimasi mulai proyek dan kalender organisasi.
            <strong> Durasi aktual</strong> = mulai paling awal s/d selesai paling akhir di draft.{" "}
            <strong>Durasi target (hari)</strong> menskalakan template saat{" "}
            <strong>Generate draft dari template</strong> (total phase root ≈ target). Edit baris
            lalu simpan sebelum fase Kick Off.
          </p>
        </div>
        {!canEditSph && draftTimeline.length > 0 && (
          <p className="text-muted">Timeline SPH read-only — ditampilkan untuk referensi.</p>
        )}
        <div className="form-grid-2">
          <div className="form-row">
            <label htmlFor="sph-start">Estimasi mulai proyek</label>
            <input
              id="sph-start"
              type="date"
              disabled={!canEditSph}
              value={form.estimated_start_date}
              onChange={(e) => setForm({ ...form, estimated_start_date: e.target.value })}
              onBlur={() => {
                if (!canEditSph) return;
                persistTimelinePlanning().catch((e) => setMsg(getErrorMessage(e)));
                if (draftTimeline.length > 0) {
                  saveDraftTimeline();
                }
              }}
            />
          </div>
          <div className="form-row">
            <label htmlFor="sph-days">Durasi target (hari)</label>
            <input
              id="sph-days"
              type="number"
              min={1}
              disabled={!canEditSph}
              value={form.target_delivery_days}
              onChange={(e) => setForm({ ...form, target_delivery_days: e.target.value })}
              onBlur={() => {
                if (!canEditSph) return;
                persistTimelinePlanning()
                  .then(() => {
                    if (draftTimeline.length > 0) {
                      return load();
                    }
                  })
                  .catch((e) => setMsg(getErrorMessage(e)));
              }}
            />
            {formatProjectTimelineSummary(projectTimeline) && (
              <p className="text-muted" style={{ marginTop: "0.35rem", fontSize: "0.9rem" }}>
                Durasi aktual dari timeline:{" "}
                <strong>{formatProjectTimelineSummary(projectTimeline)}</strong>
              </p>
            )}
          </div>
          <div className="form-row">
            <label>Tipe proyek</label>
            <select
              value={methodology}
              disabled={!canEditSph}
              onChange={(e) => saveMethodology(e.target.value)}
            >
              <option value="waterfall">Waterfall</option>
              <option value="hybrid">Hybrid</option>
              <option value="agile">Agile</option>
            </select>
          </div>
          <div className="form-row">
            <label>Template timeline</label>
            <select
              value={timelineTemplateId}
              onChange={(e) => setTimelineTemplateId(e.target.value)}
              disabled={!canEditSph}
            >
              <option value="">— Default metodologi —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ui-toolbar">
          <button
            type="button"
            className="primary"
            disabled={!canEditSph || !hasTimelineStart}
            title={
              hasTimelineStart
                ? "Isi dari template + tipe proyek"
                : "Isi estimasi mulai proyek terlebih dahulu"
            }
            onClick={generateDraftFromTemplate}
          >
            Generate draft dari template
          </button>
        </div>
        {draftTimeline.length === 0 && canEditSph && (
          <p className="text-muted">
            {hasTimelineStart
              ? "Pilih tipe proyek dan template, lalu generate draft."
              : "Isi estimasi mulai proyek — wajib sebelum generate draft dari template."}
          </p>
        )}
        {draftTimeline.length > 0 && (
          <DraftTimelineTable
            canEdit={canEditSph}
            projectId={projectId}
            timelineStart={form.estimated_start_date || null}
            draftTimeline={draftTimeline}
            setDraftTimeline={setDraftTimeline}
            projectTimeline={projectTimeline}
            onProjectTimelineChange={setProjectTimeline}
            onSave={saveDraftTimeline}
          />
        )}
      </section>
      <hr className="card-divider" />
      <section className="ui-section">
        <fieldset disabled={!canEditSph} className="sph-fieldset">
        <h3 className="ui-section__title">Term of payment</h3>
        <p className="ui-section__desc">
          Termin ter-map ke milestone draft mengikuti tanggal timeline setelah simpan & hitung
          ulang.
        </p>
        <p>
          Total SPH: <strong>{formatRupiah(sphTotal || deliveryTotal)}</strong>
        </p>
        {paymentTerms.length === 0 ? (
          <p className="text-muted">Belum ada termin.</p>
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Milestone (draft)</th>
                <th>Jatuh tempo</th>
                <th>%</th>
                <th>Nilai (Rp)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {paymentTerms.map((row, index) => (
                <tr key={`pt-${index}`}>
                  <td>
                    <input
                      value={row.label}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        next[index] = { ...next[index], label: e.target.value };
                        setPaymentTerms(next);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={row.draft_milestone_id}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        const id = e.target.value;
                        const hit = draftTimeline.find((d) => String(d.id) === id);
                        next[index] = {
                          ...next[index],
                          draft_milestone_id: id,
                          draft_milestone_row_key: hit?.row_key ?? "",
                          due_date: hit?.target_date
                            ? toDateInputValue(hit.target_date)
                            : next[index].due_date,
                          label: next[index].label || hit?.name || "",
                        };
                        setPaymentTerms(next);
                      }}
                    >
                      <option value="">— Manual —</option>
                      {draftTimeline.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {d.target_date ? ` (${formatDisplayDate(d.target_date)})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="sph-inline-input"
                      value={toDateInputValue(row.due_date)}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        next[index] = { ...next[index], due_date: e.target.value };
                        setPaymentTerms(next);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={row.percent_pct}
                      onChange={(e) => {
                        const next = [...paymentTerms];
                        next[index] = { ...next[index], percent_pct: e.target.value };
                        setPaymentTerms(next);
                      }}
                    />
                  </td>
                  <td>{termAmount(row.percent_pct)}</td>
                  <td>
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() => removePaymentTerm(index)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <TabFormFooter hint="Termin ter-map ke milestone draft setelah simpan & hitung ulang timeline.">
          <button type="button" className="btn-add-row" onClick={addPaymentTerm}>
            Tambah termin
          </button>
          <button type="button" className="primary" onClick={savePaymentTerms}>
            Simpan termin pembayaran
          </button>
        </TabFormFooter>
        </fieldset>
      </section>
      <TabPhaseFooter
        hint="Aktif jika SPH lengkap, draft timeline ada, dan termin disimpan. PO opsional sampai Closing."
      >
        <button
          type="button"
          className="primary btn-phase-advance"
          disabled={!isComplete || !canEditSph || draftTimeline.length === 0}
          title={
            isComplete
              ? "SPH lengkap + draft + termin → lanjut Kick Off"
              : "Lengkapi SPH, draft timeline, dan termin pembayaran"
          }
          onClick={finalizeTimelineForKickoff}
        >
          Lanjut fase → Kick Off
        </button>
      </TabPhaseFooter>
      <TabDocumentUpload
        projectId={projectId}
        docType="sph"
        phase="po_received"
        title="Dokumen SPH"
        hint="PDF/Office/image — tampil di sini dan tab Documents. Jika folder GDrive proyek sudah di-set, file juga disalin ke Drive (butuh service account di server)."
        readOnly={!canEditSph}
      />
    </div>
  );
}
