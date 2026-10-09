import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../../../api";
import { TabDocumentUpload } from "../../../components/TabDocumentUpload";
import { toDateInputValue } from "../../../lib/formatDate";
import { newId } from "../../../lib/newId";
import { TAB_READONLY_MSG, poFormComplete } from "../projectPhaseAccess";
import { TabAlert, TabFormFooter, TabReadOnlyNotice } from "../shared/TabLayout";
import { formatIdr, poFieldClean } from "../shared/moneyFormat";
import type { PoForm, PoServiceItem } from "./poTypes";
export function PoTab({
  projectId,
  readOnly,
  currentPhase,
  onProjectRefresh,
}: {
  projectId: number;
  readOnly?: boolean;
  currentPhase?: string;
  onProjectRefresh?: () => void;
}) {
  const emptyItem = (): PoServiceItem => ({
    id: newId(),
    name: "",
    qty: 0,
    uom: "",
    target_delivery: "",
    warranty: "",
    unit_price: 0,
  });
  const [form, setForm] = useState<PoForm>({
    po_no: "",
    po_name: "",
    buyer_name: "",
    contract_number: "",
    quotation_reference: "",
    po_due_date: "",
    po_payment_terms: [{ label: "Termin 1", percent_pct: "", due_date: "" }],
    service_items: [emptyItem()],
    po_sub_total: null,
  });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{
      po_no: string | null;
      po_name: string | null;
      buyer_name: string | null;
      contract_number: string | null;
      quotation_reference: string | null;
      po_due_date: string | null;
      po_payment_terms: { label?: string; percent_pct?: number; due_date?: string }[];
      service_items: PoServiceItem[];
      po_sub_total: number | null;
    }>(`/projects/${projectId}/po`)
      .then((p) => {
        setForm({
          po_no: poFieldClean(p.po_no),
          po_name: poFieldClean(p.po_name),
          buyer_name: poFieldClean(p.buyer_name),
          contract_number: poFieldClean(p.contract_number),
          quotation_reference: poFieldClean(p.quotation_reference),
          po_due_date: toDateInputValue(p.po_due_date),
          po_payment_terms: (p.po_payment_terms?.length ? p.po_payment_terms : [{ label: "Termin 1" }]).map(
            (t) => ({
              label: t.label ?? "",
              percent_pct: t.percent_pct != null ? String(t.percent_pct) : "",
              due_date: t.due_date ?? "",
            }),
          ),
          service_items: (p.service_items?.length ? p.service_items : [emptyItem()]).map((s) => ({
            id: s.id || newId(),
            name: s.name ?? "",
            qty: Number(s.qty) || 0,
            uom: s.uom ?? "",
            target_delivery: s.target_delivery ?? "",
            warranty: s.warranty ?? "",
            unit_price: Number(s.unit_price) || 0,
          })),
          po_sub_total: p.po_sub_total,
        });
      })
      .catch((e) => setMsg(getErrorMessage(e)));
  }, [projectId]);
  const lineSub = form.service_items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
  const contractTotal = form.po_sub_total ?? lineSub;
  const termPctSum = form.po_payment_terms.reduce(
    (s, t) => s + (Number(t.percent_pct) || 0),
    0,
  );
  const msgOk = msg === "PO disimpan.";
  const save = async () => {
    if (readOnly) return;
    setMsg("");
    try {
      const res = await api<{ po_sub_total: number | null }>(`/projects/${projectId}/po`, {
        method: "PUT",
        body: JSON.stringify({
          po_no: form.po_no.trim() || null,
          po_name: form.po_name.trim() || null,
          buyer_name: form.buyer_name.trim() || null,
          contract_number: form.contract_number.trim() || null,
          quotation_reference: form.quotation_reference.trim() || null,
          po_due_date: form.po_due_date || null,
          po_payment_terms: form.po_payment_terms
            .filter((t) => t.label.trim())
            .map((t) => ({
              label: t.label.trim(),
              percent_pct: t.percent_pct ? Number(t.percent_pct) : null,
              due_date: t.due_date || null,
            })),
          service_items: form.service_items.filter((s) => s.name.trim()),
        }),
      });
      setForm((f) => ({ ...f, po_sub_total: res.po_sub_total }));
      setMsg("PO disimpan.");
      onProjectRefresh?.();
    } catch (e) {
      setMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card card--sph card--po">
      <div className="po-page-header">
        <div className="po-page-header-text">
          <h2 className="card-title">Purchase Order</h2>
          <p className="text-muted form-hint">
            Opsional di awal proyek. Wajib lengkap sebelum fase BAST dan Closing: nomor PO, due date,
            service item, atau judul PO.
          </p>
        </div>
        <div className="po-kpi" aria-live="polite">
          <span className="po-kpi-label">Nilai kontrak (sistem)</span>
          <strong className="po-kpi-value">{formatIdr(contractTotal)}</strong>
          <span className="po-kpi-hint">Dari subtotal service items</span>
        </div>
      </div>

      <TabAlert message={msg} variant={msg ? (msgOk ? "success" : "error") : undefined} />
      {readOnly && <TabReadOnlyNotice message={TAB_READONLY_MSG.po} />}
      {!readOnly &&
        (currentPhase === "in_delivery" || currentPhase === "bast") &&
        !poFormComplete(form) && (
          <TabAlert
            message="Data PO wajib lengkap sebelum lanjut ke fase BAST atau Closing (nomor PO, due date, service item atau judul PO)."
            variant="info"
          />
        )}

      <fieldset disabled={readOnly} className="sph-fieldset">
        <section className="sph-info-panel" aria-labelledby="po-info-heading">
          <h3 id="po-info-heading" className="sph-info-panel__title">
            Identitas PO
          </h3>
          <div className="sph-info-grid">
            <div className="form-row sph-info-grid__full">
              <label htmlFor="po-no">Nomor PO</label>
              <input
                id="po-no"
                className="sph-info-input"
                placeholder="Contoh: PO-2026-001"
                value={form.po_no}
                onChange={(e) => setForm({ ...form, po_no: e.target.value })}
              />
            </div>
            <div className="form-row sph-info-grid__full">
              <label htmlFor="po-name">Judul / nama PO</label>
              <input
                id="po-name"
                className="sph-info-input"
                placeholder="Judul kontrak atau scope PO"
                value={form.po_name}
                onChange={(e) => setForm({ ...form, po_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-due">Due date PO</label>
              <input
                id="po-due"
                className="sph-info-input"
                type="date"
                value={form.po_due_date}
                onChange={(e) => setForm({ ...form, po_due_date: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-buyer">Nama buyer</label>
              <input
                id="po-buyer"
                className="sph-info-input"
                placeholder="Pembeli / counterparty"
                value={form.buyer_name}
                onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-contract">Nomor kontrak</label>
              <input
                id="po-contract"
                className="sph-info-input"
                placeholder="Opsional"
                value={form.contract_number}
                onChange={(e) => setForm({ ...form, contract_number: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="po-quot">Referensi quotation</label>
              <input
                id="po-quot"
                className="sph-info-input"
                placeholder="No. SPH / penawaran"
                value={form.quotation_reference}
                onChange={(e) => setForm({ ...form, quotation_reference: e.target.value })}
              />
            </div>
          </div>
        </section>

        <h3 className="subsection-title">Termin pembayaran</h3>
        <p className="text-muted form-hint" style={{ marginTop: "-0.5rem", marginBottom: "0.65rem" }}>
          Total persentase:{" "}
          <span className={Math.abs(termPctSum - 100) > 0.5 ? "error" : ""}>
            {termPctSum.toFixed(0)}%
          </span>
          {termPctSum > 0 ? " · ideal 100%" : ""}
        </p>
        <div className="sph-list-panel">
        <div className="po-section-toolbar">
          <span className="text-muted form-hint" style={{ margin: 0 }}>
            Tambah baris termin sesuai kontrak.
          </span>
          <button
            type="button"
            className="po-btn-add"
            onClick={() =>
              setForm({
                ...form,
                po_payment_terms: [
                  ...form.po_payment_terms,
                  {
                    label: `Termin ${form.po_payment_terms.length + 1}`,
                    percent_pct: "",
                    due_date: "",
                  },
                ],
              })
            }
          >
            + Termin
          </button>
        </div>
        <div className="table-scroll po-table-wrap">
          <table className="data-table po-table po-table--termin">
            <thead>
              <tr>
                <th>Label</th>
                <th>Bobot %</th>
                <th>Jatuh tempo</th>
                <th className="po-col-actions" />
              </tr>
            </thead>
            <tbody>
              {form.po_payment_terms.map((t, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      className="po-cell-input"
                      value={t.label}
                      onChange={(e) => {
                        const next = [...form.po_payment_terms];
                        next[idx] = { ...t, label: e.target.value };
                        setForm({ ...form, po_payment_terms: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--narrow"
                      type="number"
                      min={0}
                      max={100}
                      value={t.percent_pct}
                      onChange={(e) => {
                        const next = [...form.po_payment_terms];
                        next[idx] = { ...t, percent_pct: e.target.value };
                        setForm({ ...form, po_payment_terms: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input"
                      type="date"
                      value={t.due_date}
                      onChange={(e) => {
                        const next = [...form.po_payment_terms];
                        next[idx] = { ...t, due_date: e.target.value };
                        setForm({ ...form, po_payment_terms: next });
                      }}
                    />
                  </td>
                  <td className="po-col-actions">
                    <button
                      type="button"
                      className="danger-link"
                      disabled={form.po_payment_terms.length <= 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          po_payment_terms: form.po_payment_terms.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>

        <h3 className="subsection-title">Service items</h3>
        <div className="sph-list-panel">
        <div className="po-section-toolbar">
          <span className="text-muted form-hint" style={{ margin: 0 }}>
            Baris layanan menentukan subtotal kontrak.
          </span>
          <button
            type="button"
            className="po-btn-add"
            onClick={() =>
              setForm({ ...form, service_items: [...form.service_items, emptyItem()] })
            }
          >
            + Service item
          </button>
        </div>
        <div className="table-scroll po-table-wrap">
          <table className="data-table po-table po-table--services">
            <thead>
              <tr>
                <th>Item / layanan</th>
                <th>Qty</th>
                <th>Satuan</th>
                <th>Target delivery</th>
                <th>Garansi</th>
                <th>Harga satuan</th>
                <th>Subtotal</th>
                <th className="po-col-actions" />
              </tr>
            </thead>
            <tbody>
              {form.service_items.map((s, idx) => (
                <tr key={s.id}>
                  <td>
                    <input
                      className="po-cell-input"
                      placeholder="Nama item"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, name: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--narrow"
                      type="number"
                      min={0}
                      value={s.qty || ""}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, qty: Number(e.target.value) };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--narrow"
                      placeholder="Lot"
                      value={s.uom}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, uom: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input"
                      type="date"
                      value={s.target_delivery}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, target_delivery: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input"
                      placeholder="—"
                      value={s.warranty}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, warranty: e.target.value };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="po-cell-input po-cell-input--money"
                      type="number"
                      min={0}
                      value={s.unit_price || ""}
                      onChange={(e) => {
                        const next = [...form.service_items];
                        next[idx] = { ...s, unit_price: Number(e.target.value) };
                        setForm({ ...form, service_items: next });
                      }}
                    />
                  </td>
                  <td className="po-line-sub">{formatIdr(s.qty * s.unit_price)}</td>
                  <td className="po-col-actions">
                    <button
                      type="button"
                      className="danger-link"
                      disabled={form.service_items.length <= 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          service_items: form.service_items.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sph-total-line">
          Subtotal PO (preview): <strong>{formatIdr(lineSub)}</strong>
        </p>
        </div>

        <TabFormFooter hint="Menyimpan header PO, termin, dan baris layanan.">
          <button type="button" className="primary" onClick={save} disabled={readOnly}>
            Simpan PO
          </button>
        </TabFormFooter>
      </fieldset>
      <TabDocumentUpload
        projectId={projectId}
        docType="po"
        phase="po_received"
        title="Dokumen PO"
        hint="Unggah scan/PDF PO — tersimpan di PDC dan (jika dikonfigurasi) folder Google Drive proyek."
        readOnly={readOnly}
      />
    </div>
  );
}

