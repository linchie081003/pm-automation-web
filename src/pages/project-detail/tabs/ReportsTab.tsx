import { useEffect, useMemo, useState } from "react";
import { api, downloadFile, getErrorMessage } from "../../../api";
import { useAuth } from "../../../auth";
import { formatDisplayDate, todayIsoDateInJakarta, toDateInputValue } from "../../../lib/formatDate";
import { SPI_PERIOD_LABEL, SPI_PERIOD_TITLE } from "../../../lib/spiLabels";
import { DELIVERY_PHASES } from "../projectPhaseAccess";
import { TabAlert, TabFormFooter, TabNoticeStack } from "../shared/TabLayout";
import { MilestoneChart } from "../charts/milestoneChart";
import type { MilestoneChartItem } from "../charts/milestoneChart";
import { ScurveChart } from "../charts/scurveChart";
import { ProjectRagConfig } from "./reports/ProjectRagConfig";
import {
  canUseWeeklyReportActions,
  displayPeriodDayCount,
  formatStoredWeeklyPeriod,
  formatWeeklyPeriodOptionLabel,
  isFutureReportDate,
  isPastReportDate,
  reportDateFromOption,
  reportPeriodStatus,
  reportPeriodStatusLabel,
  spiTone,
  weeklyPreviewMetricsLabel,
  type WeeklyReportPeriodOption,
} from "./reports/reportPeriodHelpers";
import {
  formatDeviationPct,
  ragDisplayLabel,
  type WeeklyPreview,
} from "./reports/reportPreviewTypes";
import { fmtPctCell } from "../charts/chartHelpers";
import { WEEKDAY_OPTS } from "./reports/weekdayOpts";
export function ReportsTab({
  projectId,
  projectCode,
  projectName,
  currentPhase,
  deliveryStarted,
  kickoffTimelineConfirmed,
  onProjectRefresh,
}: {
  projectId: number;
  projectCode?: string;
  projectName?: string;
  currentPhase: string;
  deliveryStarted: boolean;
  kickoffTimelineConfirmed: boolean;
  onProjectRefresh?: () => void;
}) {
  const { can } = useAuth();
  const canReadReports =
    can("reports.weekly.download") ||
    can("reports.weekly.generate") ||
    can("schedule.read");
  const canGenerateReport = can("reports.weekly.generate");
  const canSaveWeekSnapshot = can("schedule.save_week");
  const inDelivery = deliveryStarted && DELIVERY_PHASES.has(currentPhase);
  const [reports, setReports] = useState<
    { id: number; week_start: string; week_end: string; period_label: string; has_pptx?: boolean }[]
  >([]);
  const [scurve, setScurve] = useState<
    {
      date: string;
      planned_pct: number;
      actual_pct: number | null;
      spi: number | null;
    }[]
  >([]);
  const [anchorOptions, setAnchorOptions] = useState<WeeklyReportPeriodOption[]>([]);
  const [targetWeek, setTargetWeek] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<WeeklyPreview | null>(null);
  const [previewNotes, setPreviewNotes] = useState("");
  const [previewMitigation, setPreviewMitigation] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewLoadingDate, setPreviewLoadingDate] = useState<string | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [weeklyCfg, setWeeklyCfg] = useState({
    weekly_report_anchor_weekday: 4,
    weekly_report_cutoff_offset_days: 6,
    weekly_report_first_anchor_date: "",
  });
  const [anchorMeta, setAnchorMeta] = useState<{
    project_start_date: string | null;
    schedule_end: string | null;
    min_first_anchor_date: string | null;
  }>({ project_start_date: null, schedule_end: null, min_first_anchor_date: null });
  const [activeReportAnchor, setActiveReportAnchor] = useState<string | null>(null);
  const [statusDateReport, setStatusDateReport] = useState<string | null>(null);
  const [, setActivePeriodStart] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"scurve" | "milestone">("scurve");
  const [milestoneChart, setMilestoneChart] = useState<{
    as_of: string | null;
    cut_off_date: string | null;
    status_date_report?: string | null;
    active_report_date?: string | null;
    active_anchor_date?: string | null;
    items: MilestoneChartItem[];
  }>({ as_of: null, cut_off_date: null, items: [] });
  const [targetAnchors, setTargetAnchors] = useState<
    {
      report_date?: string;
      period_start?: string;
      anchor_date: string;
      cut_off_date: string;
      planned_cumulative_pct?: number;
    }[]
  >([]);
  const [scheduleMsg, setScheduleMsg] = useState("");
  const loadScurve = () =>
    api<typeof scurve>(`/projects/${projectId}/schedule/scurve`)
      .then((pts) => {
        setScurve(pts);
      })
      .catch(() => setScurve([]));
  const loadMilestoneChart = () =>
    api<typeof milestoneChart>(`/projects/${projectId}/schedule/milestone-chart`)
      .then(setMilestoneChart)
      .catch(() => setMilestoneChart({ as_of: null, cut_off_date: null, items: [] }));
  const showScurveChart =
    kickoffTimelineConfirmed ||
    inDelivery ||
    targetAnchors.length > 0 ||
    scurve.length > 0;
  const load = () =>
    canReadReports
      ? api<typeof reports>(`/projects/${projectId}/weekly-reports`).then(setReports)
      : Promise.resolve();
  useEffect(() => {
    if (!canReadReports) {
      setErr(
        "Anda tidak punya izin melihat laporan mingguan (reports.weekly.* atau schedule.read). Hubungi admin untuk peran Delivery/PM/Finance.",
      );
      return;
    }
    load().catch((e) => setErr(getErrorMessage(e)));
    api<{
      weekly_report_anchor_weekday?: number;
      weekly_report_cutoff_offset_days?: number;
      weekly_report_first_anchor_date?: string | null;
      report_weekday?: number;
      period_length_days?: number;
      first_report_date?: string | null;
    }>(`/projects/${projectId}`)
      .then((p) =>
        setWeeklyCfg({
          weekly_report_anchor_weekday: p.report_weekday ?? p.weekly_report_anchor_weekday ?? 4,
          weekly_report_cutoff_offset_days:
            p.period_length_days ?? p.weekly_report_cutoff_offset_days ?? 6,
          weekly_report_first_anchor_date: toDateInputValue(
            p.first_report_date ?? p.weekly_report_first_anchor_date,
          ),
        }),
      )
      .catch(() => {});
    const loadAnchorMeta = () =>
      api<{
        anchors: WeeklyReportPeriodOption[];
        anchors_started?: WeeklyReportPeriodOption[];
        project_start_date?: string | null;
        schedule_end?: string | null;
        active_report_date?: string | null;
        active_anchor_date?: string | null;
        status_date_report?: string | null;
        active_period_start?: string | null;
        min_first_report_date?: string | null;
        min_first_anchor_date?: string | null;
        schedule_warning?: string | null;
      }>(`/projects/${projectId}/schedule/report-anchors`)
        .then((r) => {
          const full = r.anchors ?? [];
          const started = r.anchors_started ?? full;
          if (r.schedule_warning) {
            setScheduleMsg(`[Data tidak valid] ${r.schedule_warning} Periode dihitung tanpa tanggal laporan pertama.`);
          }
          setActiveReportAnchor(r.active_report_date ?? r.active_anchor_date ?? null);
          setStatusDateReport(r.status_date_report ?? null);
          setActivePeriodStart(r.active_period_start ?? null);
          setAnchorMeta({
            project_start_date: r.project_start_date ?? null,
            schedule_end: r.schedule_end ?? null,
            min_first_anchor_date: r.min_first_report_date ?? r.min_first_anchor_date ?? null,
          });
          setAnchorOptions(full);
          if (started.length) {
            const today = todayIsoDateInJakarta();
            const past = started.filter((a) => reportDateFromOption(a) <= today);
            const pick = past.length
              ? reportDateFromOption(past[past.length - 1])
              : reportDateFromOption(started[0]);
            setTargetWeek((prev) => prev || pick);
          }
        })
        .catch(() => setAnchorOptions([]));
    loadAnchorMeta();
    if (kickoffTimelineConfirmed || inDelivery) {
      loadScurve();
      loadMilestoneChart();
    }
  }, [projectId, kickoffTimelineConfirmed, inDelivery, canReadReports]);
  const rejectFutureWeeklyPeriod = (reportDate: string): string | null => {
    if (!reportDate) return "Pilih tanggal laporan weekly report.";
    if (isFutureReportDate(reportDate, activeReportAnchor)) {
      return `[Data tidak valid] Periode belum dimulai — pilih tanggal laporan pada atau sebelum minggu aktif (${formatDisplayDate(activeReportAnchor)}).`;
    }
    return null;
  };

  const anchorByReportDate = useMemo(() => {
    const m = new Map<string, WeeklyReportPeriodOption>();
    for (const a of anchorOptions) {
      m.set(reportDateFromOption(a), a);
    }
    return m;
  }, [anchorOptions]);

  const reportByWeekStart = useMemo(() => {
    const m = new Map<string, { id: number; has_pptx: boolean }>();
    for (const r of reports) {
      m.set(r.week_start, { id: r.id, has_pptx: Boolean(r.has_pptx) });
    }
    return m;
  }, [reports]);

  const openPreviewForReportDate = async (reportDate: string) => {
    setErr("");
    const periodErr = rejectFutureWeeklyPeriod(reportDate);
    if (periodErr) {
      setErr(periodErr);
      return;
    }
    setPreviewLoadingDate(reportDate);
    setTargetWeek(reportDate);
    try {
      const qs = `?anchor_date=${encodeURIComponent(reportDate)}`;
      const p = await api<WeeklyPreview>(`/projects/${projectId}/weekly-reports/preview${qs}`);
      setPreviewNotes(p.highlights_draft || p.notes || "");
      setPreviewMitigation("");
      setPreview(p);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setPreviewLoadingDate(null);
    }
  };

  const openPreview = async () => {
    const rd = targetWeek || activeReportAnchor;
    if (!rd) {
      setErr("Pilih periode weekly report terlebih dahulu.");
      return;
    }
    await openPreviewForReportDate(rd);
  };

  const generateWeeklyDoc = async (reportDate: string, regenerate: boolean) => {
    setErr("");
    const periodErr = rejectFutureWeeklyPeriod(reportDate);
    if (periodErr) {
      setErr(periodErr);
      return;
    }
    if (!inDelivery) return;
    const verHint = regenerate ? " versi baru" : "";
    if (
      !window.confirm(
        `Generate dokumen weekly report${verHint} untuk tanggal laporan ${formatDisplayDate(reportDate)} ke tab Documents?`,
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await api<{ document_version?: number }>(
        `/projects/${projectId}/weekly-reports/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            anchor_date: reportDate,
            regenerate,
            notes: previewNotes.trim() || undefined,
            mitigation_plan: previewMitigation.trim() || undefined,
          }),
        },
      );
      setTargetWeek(reportDate);
      setMsg(
        `Dokumen weekly report v${String(res.document_version ?? 1).padStart(2, "0")} tersimpan di Documents.`,
      );
      load();
      loadScurve();
      onProjectRefresh?.();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };
  const saveProgressWeek = async () => {
    if (isPastReportDate(targetWeek, activeReportAnchor)) {
      setErr(
        `[Data tidak valid] Progress snapshot hanya untuk minggu laporan aktif (${formatDisplayDate(activeReportAnchor)}), bukan periode yang sudah lewat.`,
      );
      return;
    }
    const periodErr = rejectFutureWeeklyPeriod(targetWeek);
    if (periodErr) {
      setErr(periodErr);
      return;
    }
    setProgressBusy(true);
    setErr("");
    try {
      await api(`/projects/${projectId}/schedule/progress/weeks/${targetWeek}/save`, {
        method: "POST",
      });
      setMsg("Progress mingguan disimpan (snapshot).");
      api<typeof scurve>(`/projects/${projectId}/schedule/scurve`).then(setScurve);
      onProjectRefresh?.();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setProgressBusy(false);
    }
  };
  const confirmGenerate = async () => {
    if (!preview) return;
    setGenerating(true);
    setErr("");
    try {
      await api(`/projects/${projectId}/weekly-reports/generate`, {
        method: "POST",
        body: JSON.stringify({
          anchor_date: preview.week_start,
          regenerate: preview.already_exists,
          notes: previewNotes,
          mitigation_plan: previewMitigation.trim() || null,
        }),
      });
      setPreview(null);
      load();
      loadScurve();
      onProjectRefresh?.();
      setErr("");
      setMsg("Dokumen weekly report tersimpan. Lihat tab DOCUMENTS.");
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };
  const dl = async (path: string) => {
    setErr("");
    try {
      await downloadFile(path);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };
  const validateFirstWeeklyAnchor = (): string | null => {
    const first = weeklyCfg.weekly_report_first_anchor_date.trim();
    if (!first) return null;
    if (
      anchorMeta.min_first_anchor_date &&
      first < anchorMeta.min_first_anchor_date
    ) {
      return `[Data tidak valid] Tanggal laporan pertama harus ≥ tanggal laporan pertama setelah project start (${formatDisplayDate(anchorMeta.min_first_anchor_date)}).`;
    }
    const d = new Date(`${first}T12:00:00`);
    const wd = (d.getDay() + 6) % 7;
    if (wd !== weeklyCfg.weekly_report_anchor_weekday) {
      const label =
        WEEKDAY_OPTS.find((o) => o.v === weeklyCfg.weekly_report_anchor_weekday)?.label ??
        "hari laporan";
      return `[Data tidak valid] Tanggal laporan pertama harus jatuh pada hari ${label}.`;
    }
    return null;
  };
  const saveWeeklyCfg = async () => {
    setScheduleMsg("");
    const vErr = validateFirstWeeklyAnchor();
    if (vErr) {
      setScheduleMsg(vErr);
      return;
    }
    try {
      await api(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          report_weekday: weeklyCfg.weekly_report_anchor_weekday,
          period_length_days: weeklyCfg.weekly_report_cutoff_offset_days,
          first_report_date: weeklyCfg.weekly_report_first_anchor_date.trim() || null,
        }),
      });
      setScheduleMsg("Jadwal laporan disimpan.");
      api<{
        anchors: WeeklyReportPeriodOption[];
        project_start_date?: string | null;
        schedule_end?: string | null;
        min_first_report_date?: string | null;
        min_first_anchor_date?: string | null;
        active_report_date?: string | null;
        active_anchor_date?: string | null;
      }>(`/projects/${projectId}/schedule/report-anchors`)
        .then((r) => {
          setAnchorOptions(r.anchors ?? []);
          setActiveReportAnchor(r.active_report_date ?? r.active_anchor_date ?? null);
          setAnchorMeta({
            project_start_date: r.project_start_date ?? null,
            schedule_end: r.schedule_end ?? null,
            min_first_anchor_date: r.min_first_report_date ?? r.min_first_anchor_date ?? null,
          });
        })
        .catch(() => {});
    } catch (e) {
      setScheduleMsg(getErrorMessage(e));
    }
  };
  const generateAnchorTargets = async () => {
    setScheduleMsg("");
    const vErr = validateFirstWeeklyAnchor();
    if (vErr) {
      setScheduleMsg(vErr);
      return;
    }
    try {
      const r = await api<{
        anchors: {
          report_date?: string;
          period_start?: string;
          anchor_date: string;
          cut_off_date: string;
          planned_cumulative_pct: number;
        }[];
        count: number;
        created?: number;
        updated?: number;
        range_start: string;
        schedule_end: string;
      }>(`/projects/${projectId}/schedule/report-anchors/generate`, { method: "POST" });
      setTargetAnchors(r.anchors ?? []);
      setAnchorOptions(
        (r.anchors ?? []).map((a) => ({
          report_date: a.report_date ?? a.anchor_date,
          anchor_date: a.anchor_date,
          period_start: a.period_start,
          cut_off_date: a.cut_off_date,
        })),
      );
      loadScurve();
      loadMilestoneChart();
      setScheduleMsg(
        `${r.count} target weekly report — planned kumulatif ${r.created ?? 0} baru, ${r.updated ?? 0} diperbarui (${formatDisplayDate(r.range_start)} s.d. ${formatDisplayDate(r.schedule_end)}).`,
      );
    } catch (e) {
      setScheduleMsg(getErrorMessage(e));
    }
  };
  return (
    <div className="card">
      <TabNoticeStack>
        <TabAlert message={err} variant="error" />
        <TabAlert message={scheduleMsg} />
        <TabAlert message={msg} />
      </TabNoticeStack>
      <section className="weekly-schedule-card">
        <h2 className="card-title">Weekly report & S-curve</h2>
        <p className="text-muted">
          Hari laporan dan panjang periode (mundur dari tanggal laporan) menentukan rentang mingguan
          dan titik planned S-curve. Tanggal laporan pertama opsional; generate target menghitung
          semua periode sampai akhir proyek.
        </p>
        {(anchorMeta.project_start_date || anchorMeta.schedule_end) && (
          <p className="text-muted form-hint weekly-schedule-bounds">
            Timeline start: {formatDisplayDate(anchorMeta.project_start_date)} · Selesai proyek
            (target terakhir): {formatDisplayDate(anchorMeta.schedule_end)}
            {anchorMeta.min_first_anchor_date && (
              <>
                {" "}
                · Tanggal laporan pertama (setelah project start):{" "}
                <strong>{formatDisplayDate(anchorMeta.min_first_anchor_date)}</strong>
              </>
            )}
          </p>
        )}
        <div className="weekly-schedule-panel sph-info-panel">
          <div className="sph-info-grid weekly-schedule-grid">
            <div className="form-row">
              <label htmlFor="wr-anchor-weekday">Hari laporan (report weekday)</label>
              <select
                id="wr-anchor-weekday"
                className="sph-info-input"
                value={weeklyCfg.weekly_report_anchor_weekday}
                onChange={(e) =>
                  setWeeklyCfg({
                    ...weeklyCfg,
                    weekly_report_anchor_weekday: Number(e.target.value),
                  })
                }
              >
                {WEEKDAY_OPTS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="wr-cutoff">
                Panjang periode (period length, hari mundur dari tanggal laporan)
              </label>
              <input
                id="wr-cutoff"
                type="number"
                min={0}
                className="sph-info-input"
                value={weeklyCfg.weekly_report_cutoff_offset_days}
                onChange={(e) =>
                  setWeeklyCfg({
                    ...weeklyCfg,
                    weekly_report_cutoff_offset_days: Number(e.target.value),
                  })
                }
              />
              <p className="form-hint" style={{ margin: "0.35rem 0 0" }}>
                ≈ {displayPeriodDayCount(weeklyCfg.weekly_report_cutoff_offset_days)} hari kalender
                (inklusif) per periode laporan.
              </p>
            </div>
            <div className="form-row sph-info-grid__full">
              <label htmlFor="wr-first-anchor">Tanggal laporan pertama (opsional)</label>
              <input
                id="wr-first-anchor"
                type="date"
                className="sph-info-input"
                value={weeklyCfg.weekly_report_first_anchor_date}
                onChange={(e) =>
                  setWeeklyCfg({
                    ...weeklyCfg,
                    weekly_report_first_anchor_date: e.target.value,
                  })
                }
              />
              <p className="form-hint" style={{ margin: "0.35rem 0 0" }}>
                Jika diisi, harus ≥ tanggal laporan pertama setelah project start dan jatuh pada
                hari laporan. Kosongkan = otomatis setelah project start. Planned
                kumulatif = Σ (bobot phase × progress phase); progress phase = hari kerja elapsed ÷
                total hari kerja phase (0–100%).
              </p>
            </div>
          </div>
          <TabFormFooter hint="Jadwal laporan mempengaruhi periode S-curve dan weekly report.">
            <button
              type="button"
              disabled={!canSaveWeekSnapshot}
              title={canSaveWeekSnapshot ? undefined : "Butuh izin schedule.save_week (PM)"}
              onClick={() => void generateAnchorTargets()}
            >
              Generate target weekly report
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canSaveWeekSnapshot}
              title={canSaveWeekSnapshot ? undefined : "Butuh izin schedule.save_week (PM)"}
              onClick={() => void saveWeeklyCfg()}
            >
              Simpan jadwal laporan
            </button>
          </TabFormFooter>
        </div>
        {targetAnchors.length > 0 && (
          <div className="weekly-target-anchors">
            <h3 className="subsection-title">Target weekly report</h3>
            <p className="text-muted form-hint">
              {targetAnchors.length} periode s.d. akhir proyek — planned kumulatif 100% pada
              periode terakhir.
            </p>
            <div className="weekly-target-anchors__scroll">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tanggal laporan</th>
                    <th>Periode</th>
                    <th className="num">Planned kumulatif (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {targetAnchors.map((a, i) => (
                    <tr key={a.anchor_date}>
                      <td>{i + 1}</td>
                      <td>{formatDisplayDate(a.report_date ?? a.anchor_date)}</td>
                      <td>
                        {formatWeeklyPeriodOptionLabel({
                          report_date: a.report_date,
                          anchor_date: a.anchor_date,
                          period_start: a.period_start,
                          cut_off_date: a.cut_off_date,
                        })}
                      </td>
                      <td className="num">
                        {a.planned_cumulative_pct != null
                          ? Number(a.planned_cumulative_pct).toFixed(2)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <hr className="card-divider" />
      <ProjectRagConfig projectId={projectId} />
      <hr className="card-divider" />
      <section className="scurve-section">
        <div className="scurve-section__head">
          <h2 className="card-title">S-Curve</h2>
          {showScurveChart && (
            <div className="scurve-chart-toggle" role="tablist" aria-label="Jenis grafik">
              <button
                type="button"
                role="tab"
                aria-selected={chartView === "scurve"}
                className={chartView === "scurve" ? "is-active" : ""}
                onClick={() => setChartView("scurve")}
              >
                Grafik S-curve
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chartView === "milestone"}
                className={chartView === "milestone" ? "is-active" : ""}
                onClick={() => {
                  setChartView("milestone");
                  void loadMilestoneChart();
                }}
              >
                Grafik milestone
              </button>
            </div>
          )}
        </div>
        {!showScurveChart && (
          <p className="text-muted">
            S-curve planned tampil setelah timeline kick off dikonfirmasi dan Anda menjalankan
            Generate target weekly report (atau saat proyek sudah masuk delivery).
          </p>
        )}
        {showScurveChart && chartView === "scurve" && (
          <ScurveChart
            points={scurve}
            activeAnchor={activeReportAnchor}
            statusDateReport={statusDateReport}
            projectCode={projectCode}
            projectName={projectName}
          />
        )}
        {showScurveChart && chartView === "milestone" && (
          <MilestoneChart
            items={milestoneChart.items}
            asOf={milestoneChart.as_of}
            cutOff={milestoneChart.cut_off_date}
            statusDateReport={
              milestoneChart.status_date_report ?? statusDateReport
            }
            activeAnchor={
              milestoneChart.active_report_date ??
              milestoneChart.active_anchor_date ??
              activeReportAnchor
            }
            projectCode={projectCode}
            projectName={projectName}
          />
        )}
        {showScurveChart && chartView === "scurve" && scurve.length > 0 && (
          <div className="scurve-period-table-wrap">
            <div className="scurve-period-table__head">
              <h3 className="subsection-title">Periode weekly report</h3>
              <p className="text-muted scurve-period-table__subtitle">
                Preview atau generate laporan per baris. Periode mendatang tidak dapat diproses
                hingga periode dimulai.
              </p>
            </div>
            <div className="scurve-period-table__scroll">
              <table className="data-table scurve-period-table">
                <thead>
                  <tr>
                    <th>Tanggal laporan</th>
                    <th>Periode</th>
                    <th>Status</th>
                    <th className="num">Planned</th>
                    <th className="num">Actual</th>
                    <th className="num" title={SPI_PERIOD_TITLE}>
                      {SPI_PERIOD_LABEL}
                    </th>
                    <th>Laporan</th>
                    <th className="scurve-period-table__actions-col">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {scurve.map((p) => {
                    const rd = p.date;
                    const status = reportPeriodStatus(rd, activeReportAnchor);
                    const actionsOk =
                      canUseWeeklyReportActions(status) && inDelivery && canGenerateReport;
                    const periodOpt = anchorByReportDate.get(rd);
                    const periodLabel = periodOpt
                      ? formatWeeklyPeriodOptionLabel(periodOpt)
                      : formatDisplayDate(rd);
                    const savedReport = reportByWeekStart.get(rd);
                    const hasReport = Boolean(savedReport);
                    const rowBusy = previewLoadingDate === rd;
                    return (
                      <tr
                        key={rd}
                        className={
                          status === "active"
                            ? "scurve-period-table__row scurve-period-table__row--active"
                            : status === "future"
                              ? "scurve-period-table__row scurve-period-table__row--future"
                              : "scurve-period-table__row"
                        }
                      >
                        <td className="scurve-period-table__date">
                          <span className="scurve-period-table__date-main">
                            {formatDisplayDate(rd)}
                          </span>
                        </td>
                        <td className="scurve-period-table__period">{periodLabel}</td>
                        <td>
                          <span
                            className={`scurve-period-status scurve-period-status--${status}`}
                          >
                            {reportPeriodStatusLabel(status)}
                          </span>
                        </td>
                        <td className="num">{fmtPctCell(p.planned_pct)}</td>
                        <td className="num">{fmtPctCell(p.actual_pct)}</td>
                        <td className="num">
                          {p.spi != null && !Number.isNaN(Number(p.spi)) ? (
                            <span
                              className={`scurve-spi-pill scurve-spi-pill--${spiTone(Number(p.spi))}`}
                            >
                              {Number(p.spi).toFixed(4)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="scurve-period-table__report">
                          {savedReport ? (
                            <span className="scurve-report-links">
                              <a
                                href={`/api/projects/${projectId}/weekly-reports/${savedReport.id}/download`}
                                className="scurve-report-link"
                                title="Unduh laporan Excel"
                                onClick={(e) => {
                                  e.preventDefault();
                                  void dl(
                                    `/projects/${projectId}/weekly-reports/${savedReport.id}/download`,
                                  );
                                }}
                              >
                                XLS
                              </a>
                              {savedReport.has_pptx ? (
                                <a
                                  href={`/api/projects/${projectId}/weekly-reports/${savedReport.id}/download-pptx`}
                                  className="scurve-report-link"
                                  title="Unduh presentasi PowerPoint"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    void dl(
                                      `/projects/${projectId}/weekly-reports/${savedReport.id}/download-pptx`,
                                    );
                                  }}
                                >
                                  PPTX
                                </a>
                              ) : null}
                            </span>
                          ) : (
                            <span className="scurve-report-chip scurve-report-chip--none">
                              Belum ada
                            </span>
                          )}
                        </td>
                        <td className="scurve-period-table__actions">
                          <div className="scurve-row-actions">
                            <button
                              type="button"
                              className="scurve-row-actions__btn"
                              disabled={!actionsOk || rowBusy || generating}
                              title={
                                !canGenerateReport
                                  ? "Butuh izin reports.weekly.generate"
                                  : !inDelivery
                                    ? "Weekly report aktif setelah fase delivery"
                                    : status === "future"
                                      ? "Periode belum dimulai"
                                      : "Preview isi laporan minggu ini"
                              }
                              onClick={() => void openPreviewForReportDate(rd)}
                            >
                              {rowBusy ? "…" : "Preview"}
                            </button>
                            <button
                              type="button"
                              className="scurve-row-actions__btn scurve-row-actions__btn--primary"
                              disabled={!actionsOk || rowBusy || generating}
                              title={
                                !canGenerateReport
                                  ? "Butuh izin reports.weekly.generate"
                                  : !inDelivery
                                    ? "Weekly report aktif setelah fase delivery"
                                    : status === "future"
                                      ? "Periode belum dimulai"
                                      : hasReport
                                        ? "Buat versi dokumen baru di Documents"
                                        : "Generate dokumen ke Documents"
                              }
                              onClick={() => void generateWeeklyDoc(rd, hasReport)}
                            >
                              {generating ? "…" : hasReport ? "Generate v+" : "Generate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <h2 className="card-title" style={{ marginTop: "1.5rem" }}>
        Weekly report
      </h2>
      <div className="weekly-report-controls">
        {!inDelivery && (
          <p className="text-muted">Weekly report & progress snapshot aktif setelah fase delivery.</p>
        )}
        <div className="form-row">
          <label htmlFor="wr-target-week">Periode weekly report (tanggal laporan)</label>
          <select
            id="wr-target-week"
            value={targetWeek}
            onChange={(e) => setTargetWeek(e.target.value)}
          >
            <option value="">— pilih periode —</option>
            {anchorOptions.map((a) => {
              const rd = reportDateFromOption(a);
              const future = isFutureReportDate(rd, activeReportAnchor);
              const past = isPastReportDate(rd, activeReportAnchor);
              return (
                <option key={rd} value={rd} disabled={future}>
                  {formatWeeklyPeriodOptionLabel(a)}
                  {future ? " — belum dimulai" : past ? " — sudah lewat (snapshot nonaktif)" : ""}
                </option>
              );
            })}
          </select>
        </div>
        {anchorOptions.length === 0 && (
          <p className="text-muted">
            Belum ada periode — simpan jadwal laporan di atas; timeline kick off memperkaya rentang
            tanggal.
          </p>
        )}
        <div className="btn-group">
          <button
            type="button"
            onClick={saveProgressWeek}
            disabled={
              progressBusy ||
              !canSaveWeekSnapshot ||
              !inDelivery ||
              !targetWeek ||
              targetWeek !== activeReportAnchor
            }
            title={
              targetWeek && activeReportAnchor && targetWeek !== activeReportAnchor
                ? "Snapshot hanya untuk minggu laporan aktif"
                : undefined
            }
          >
            Generate progress (snapshot)
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void openPreview()}
            disabled={
              !canGenerateReport || !inDelivery || (!targetWeek && !activeReportAnchor)
            }
          >
            Preview periode terpilih
          </button>
        </div>
      </div>
      {preview && (
        <div className="modal-overlay weekly-preview-overlay" role="dialog" aria-modal="true">
          <div className="modal-card modal-card--weekly-preview weekly-preview-modal">
            <header className="weekly-preview-modal__header">
              <div>
                <p className="weekly-preview-modal__kicker">Weekly progress report</p>
                <h2 className="weekly-preview-modal__title">
                  {preview.project_code} — {preview.project_name}
                </h2>
              </div>
              <button
                type="button"
                className="weekly-preview-modal__close"
                aria-label="Tutup"
                onClick={() => setPreview(null)}
              >
                ×
              </button>
            </header>
            <div className="weekly-preview-modal__scroll">
            <div className="weekly-preview-modal__banner">
              <div>
                <span className="weekly-preview-modal__label">Tanggal laporan</span>
                <strong>
                  {formatDisplayDate(
                    preview.report_date ?? preview.week_end ?? preview.week_start,
                  )}
                </strong>
              </div>
              <div>
                <span className="weekly-preview-modal__label">Periode</span>
                <strong>
                  {formatStoredWeeklyPeriod(
                    preview.week_start,
                    preview.week_end,
                    preview.period_start ?? preview.target_week_start,
                  )}
                </strong>
                {preview.period_day_count != null && (
                  <span className="text-muted"> · {preview.period_day_count} hari</span>
                )}
              </div>
              <div>
                <span className="weekly-preview-modal__label">Status date</span>
                <strong>
                  {formatDisplayDate(
                    preview.status_date_report ??
                      preview.health?.status_date ??
                      preview.report_date ??
                      preview.week_end,
                  )}
                </strong>
              </div>
            </div>
            <p className="weekly-preview-modal__source">
              <span className="weekly-preview-modal__source-pill">
                {weeklyPreviewMetricsLabel(preview.metrics_source)}
              </span>
              {preview.matches_project_health && (
                <span className="weekly-preview-modal__health-sync">
                  Selaras dengan health proyek (hari ini)
                </span>
              )}
            </p>
            {preview.already_exists && (
              <TabAlert
                message={`Dokumen sudah pernah digenerate. Generate dari modal membuat versi v${String(preview.next_document_version ?? 2).padStart(2, "0")} di Documents.`}
                variant="info"
              />
            )}
            <div className="weekly-preview-modal__kpis">
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">Planned</span>
                <span className="weekly-preview-kpi__value">
                  {Number(preview.planned_pct).toFixed(2)}%
                </span>
              </div>
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">Actual</span>
                <span className="weekly-preview-kpi__value">
                  {Number(preview.actual_pct).toFixed(2)}%
                </span>
              </div>
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label">Deviasi</span>
                <span
                  className={`weekly-preview-kpi__value ${
                    (preview.deviation_pct ?? preview.deviation_pp ?? 0) < 0
                      ? "weekly-preview-kpi__value--warn"
                      : "weekly-preview-kpi__value--ok"
                  }`}
                >
                  {formatDeviationPct(preview.deviation_pct ?? preview.deviation_pp)}
                </span>
              </div>
              <div className="weekly-preview-kpi">
                <span className="weekly-preview-kpi__label" title={SPI_PERIOD_TITLE}>
                  {SPI_PERIOD_LABEL}
                </span>
                <span
                  className={`weekly-preview-kpi__value weekly-preview-kpi__value--spi scurve-spi-pill scurve-spi-pill--${spiTone(Number(preview.spi ?? 0))}`}
                >
                  {Number(preview.spi ?? 0).toFixed(4)}
                </span>
              </div>
            </div>
            <div className="weekly-preview-modal__meta">
              <span className={`rag rag-${preview.rag_overall}`}>
                RAG {ragDisplayLabel(preview.rag_overall)}
              </span>
              {preview.rag_schedule && (
                <span className={`rag rag-${preview.rag_schedule}`}>
                  Schedule {ragDisplayLabel(preview.rag_schedule)}
                </span>
              )}
              <span className="text-muted">
                Baseline v{preview.baseline_version ?? "—"} · {preview.task_count} task ·{" "}
                {preview.milestone_count} milestone ·{" "}
                {preview.output_formats.map((f) => f.toUpperCase()).join(" + ")}
              </span>
            </div>
            <div className="weekly-preview-modal__body">
            <section className="weekly-preview-block">
              <h3 className="weekly-preview-block__title">GAP phase timeline</h3>
              {preview.phase_gaps?.length ? (
                <ul className="weekly-preview-list">
                  {preview.phase_gaps.map((g) => (
                    <li key={g.name}>
                      <strong>{g.name}</strong> — target {g.planned_pct.toFixed(1)}% vs actual{" "}
                      {g.actual_pct.toFixed(1)}%
                      <span className="weekly-preview-gap"> (−{g.gap_pp.toFixed(1)} p.p.)</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted weekly-preview-empty">
                  Tidak ada phase dengan ketinggalan signifikan vs target timeline.
                </p>
              )}
            </section>
            <div className="weekly-preview-columns">
              <section className="weekly-preview-block">
                <h3 className="weekly-preview-block__title">Task selesai minggu ini</h3>
                {preview.use_phase_fallback && !preview.tasks_completed?.length && (
                  <p className="text-muted weekly-preview-period">Task tidak terdeteksi — tampil fase aktif.</p>
                )}
                {preview.tasks_completed?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.tasks_completed.map((t) => (
                      <li key={t.name}>
                        {t.name}
                        <span className="text-muted">
                          {" "}
                          · {t.status}
                          {t.due_date ? ` · due ${formatDisplayDate(t.due_date)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : preview.use_phase_fallback && preview.phases_current_week?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.phases_current_week.map((p) => (
                      <li key={p.name}>
                        <strong>{p.name}</strong>
                        <span className="text-muted">
                          {" "}
                          · target {p.planned_pct.toFixed(1)}% · actual {p.actual_pct.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted weekly-preview-empty">Belum terdeteksi di periode ini.</p>
                )}
              </section>
              <section className="weekly-preview-block">
                <h3 className="weekly-preview-block__title">Task minggu depan</h3>
                {preview.use_phase_next_fallback && !preview.tasks_next_week?.length && (
                  <p className="text-muted weekly-preview-period">Task tidak terdeteksi — tampil fase rencana.</p>
                )}
                {preview.next_period_start && preview.next_period_end && (
                  <p className="text-muted weekly-preview-period">
                    {formatDisplayDate(preview.next_period_start)} —{" "}
                    {formatDisplayDate(preview.next_period_end)}
                  </p>
                )}
                {preview.tasks_next_week?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.tasks_next_week.map((t) => (
                      <li key={t.name}>
                        {t.name}
                        <span className="text-muted">
                          {" "}
                          · {t.status}
                          {t.due_date ? ` · due ${formatDisplayDate(t.due_date)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : preview.use_phase_next_fallback && preview.phases_next_week?.length ? (
                  <ul className="weekly-preview-list weekly-preview-list--compact">
                    {preview.phases_next_week.map((p) => (
                      <li key={p.name}>
                        <strong>{p.name}</strong>
                        <span className="text-muted">
                          {" "}
                          ·{" "}
                          {p.start_date ? formatDisplayDate(p.start_date) : "—"} —{" "}
                          {p.target_date ? formatDisplayDate(p.target_date) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted weekly-preview-empty">Belum terdeteksi dari ClickUp.</p>
                )}
              </section>
            </div>
            </div>
            <footer className="weekly-preview-modal__footer">
            <div className="form-row">
              <label htmlFor="wr-mitigation">Mitigasi mengejar plan</label>
              <p className="text-muted form-hint">
                Isi manual rencana recovery sebelum generate — disimpan ke ringkasan laporan dan file
                Excel (sheet Ringkasan / placeholder template).
              </p>
              <textarea
                id="wr-mitigation"
                rows={4}
                value={previewMitigation}
                onChange={(e) => setPreviewMitigation(e.target.value)}
                placeholder="Contoh: tambah resource di fase X, percepat UAT, eskalasi blocker integrasi…"
              />
            </div>
            <div className="form-row">
              <label htmlFor="wr-notes">Catatan highlights</label>
              <p className="text-muted form-hint">
                Draft otomatis (GAP phase, task selesai, rencana minggu depan) — dapat diedit sebelum
                disimpan.
              </p>
              <textarea
                id="wr-notes"
                rows={8}
                value={previewNotes}
                onChange={(e) => setPreviewNotes(e.target.value)}
              />
            </div>
            <div className="btn-group">
              <button
                type="button"
                className="primary"
                disabled={generating}
                onClick={confirmGenerate}
              >
                {preview.already_exists
                  ? `Generate dokumen v${String(preview.next_document_version ?? 2).padStart(2, "0")}`
                  : "Generate dokumen ke Documents"}
              </button>
              <button type="button" onClick={() => setPreview(null)} disabled={generating}>
                Tutup
              </button>
            </div>
            </footer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

