import { type MouseEvent as ReactMouseEvent } from "react";
import {
  ChartPanelToolbar,
  ChartPointTooltip,
  ChartZoomViewport,
  useChartSvgRef,
  useChartTooltip,
  useChartZoom,
} from "../../../components/ChartPanelTools";
import { formatDisplayDate } from "../../../lib/formatDate";
import { SPI_PERIOD_LABEL, SPI_PERIOD_TITLE } from "../../../lib/spiLabels";
import { formatDeviationPct } from "../tabs/reports/reportPreviewTypes";
import {
  CHART_COLOR_ACTUAL,
  CHART_COLOR_PLANNED,
  ChartInlineLegend,
  fmtPctCell,
  scurveActualVisible,
  straightLinePath,
  type ScurvePointRow,
} from "./chartHelpers";
export function ScurveChart({
  points,
  activeAnchor,
  statusDateReport,
  projectCode,
  projectName,
}: {
  points: ScurvePointRow[];
  activeAnchor?: string | null;
  statusDateReport?: string | null;
  projectCode?: string;
  projectName?: string;
}) {
  const svgRef = useChartSvgRef();
  const { zoom, zoomIn, zoomOut, resetZoom } = useChartZoom();
  const { tip, showTip, moveTip, hideTip } = useChartTooltip();
  const plannedAll = points;
  if (!plannedAll.length) {
    return <p className="text-muted">Belum ada data S-curve.</p>;
  }
  const w = 960;
  const padL = 58;
  const padR = 32;
  const padT = 88;
  const padB = 108;
  const chartW = w - padL - padR;
  const chartH = 248;
  const h = padT + chartH + padB;
  const xLabelY = padT + chartH + 34;
  const yMax = 100;
  const n = plannedAll.length;
  const xs = plannedAll.map(
    (_, i) => padL + (i * chartW) / Math.max(n - 1, 1),
  );
  const y = (pct: number) => padT + chartH - (Math.min(pct, yMax) / yMax) * chartH;
  const plannedYs = plannedAll.map((p) => y(p.planned_pct));
  const plannedPath = straightLinePath(xs, plannedYs);
  const actualSeries = plannedAll.filter((p) => scurveActualVisible(p, activeAnchor ?? null));
  const actualXs = actualSeries.map((p) => xs[plannedAll.findIndex((x) => x.date === p.date)]);
  const actualYs = actualSeries.map((p) => y(Number(p.actual_pct)));
  const actualPath =
    actualSeries.length > 0 ? straightLinePath(actualXs, actualYs) : "";
  const gridSteps = [0, 25, 50, 75, 100];
  const fmtAnchor = (iso: string) => formatDisplayDate(iso);
  const labelEvery = n <= 12 ? 1 : Math.max(1, Math.ceil(n / 8));
  const activeIdx =
    activeAnchor != null ? plannedAll.findIndex((p) => p.date === activeAnchor) : -1;
  const activePoint =
    (activeAnchor != null && plannedAll.find((p) => p.date === activeAnchor)) ||
    actualSeries[actualSeries.length - 1] ||
    plannedAll[0];
  const kpiPlanned = activePoint?.planned_pct ?? 0;
  const kpiActual = activePoint?.actual_pct ?? 0;
  const kpiDev = kpiActual - kpiPlanned;
  const kpiSpi = activePoint?.spi ?? 0;
  const statusLabel = statusDateReport ? formatDisplayDate(statusDateReport) : "—";
  const anchorLabel = activeAnchor ? formatDisplayDate(activeAnchor) : "—";
  const projectTitle =
    projectCode && projectName
      ? `${projectCode} — ${projectName}`
      : projectName || projectCode || "Project S-Curve";
  const exportBasename = `${(projectCode || "project").replace(/\s+/g, "_")}_scurve`;
  return (
    <div className="scurve-panel scurve-panel--pro scurve-panel--executive">
      <div className="scurve-panel__top scurve-panel__top--executive">
        <div>
          <p className="scurve-panel__kicker">Executive progress report</p>
          <h3 className="scurve-panel__title">{projectTitle}</h3>
          <p className="scurve-panel__meta">
            <span className="scurve-meta-pill">
              Status date <strong>{statusLabel}</strong>
            </span>
            <span className="scurve-meta-pill">
              Tanggal laporan aktif <strong>{anchorLabel}</strong>
            </span>
          </p>
        </div>
      </div>
      <ChartPanelToolbar
        svgRef={svgRef}
        exportBasename={exportBasename}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={resetZoom}
      />
      <div className="scurve-kpi-strip" aria-label="KPI minggu aktif">
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">Planned</span>
          <span className="scurve-kpi-strip__value">{kpiPlanned.toFixed(2)}%</span>
        </div>
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">Actual</span>
          <span className="scurve-kpi-strip__value">{kpiActual.toFixed(2)}%</span>
        </div>
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label">Deviasi</span>
          <span
            className={`scurve-kpi-strip__value ${kpiDev < 0 ? "scurve-kpi-strip__value--down" : ""}`}
          >
            {formatDeviationPct(kpiDev)}
          </span>
        </div>
        <div className="scurve-kpi-strip__item">
          <span className="scurve-kpi-strip__label" title={SPI_PERIOD_TITLE}>
            {SPI_PERIOD_LABEL}
          </span>
          <span className="scurve-kpi-strip__value">{Number(kpiSpi).toFixed(4)}</span>
        </div>
      </div>
      <ChartZoomViewport zoom={zoom}>
      <svg
        ref={svgRef}
        className="scurve-panel__chart scurve-panel__chart--executive"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Grafik garis S-curve planned dan actual"
        onMouseLeave={hideTip}
      >
        <defs>
          <linearGradient id="scurveExecFrame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <clipPath id="scurvePlotClip">
            <rect x={padL} y={padT} width={chartW} height={chartH} rx="6" />
          </clipPath>
        </defs>
        <rect x={8} y={8} width={w - 16} height={h - 16} rx="10" fill="url(#scurveExecFrame)" />
        <rect
          x={padL}
          y={padT}
          width={chartW}
          height={chartH}
          className="scurve-plot-bg"
          rx="6"
        />
        {gridSteps.map((g) => (
          <g key={g}>
            <line
              x1={padL}
              y1={y(g)}
              x2={w - padR}
              y2={y(g)}
              className="scurve-grid-line"
            />
            <text x={padL - 10} y={y(g) + 4} textAnchor="end" className="scurve-axis-label">
              {g}
            </text>
          </g>
        ))}
        <text
          x={14}
          y={padT + chartH / 2}
          textAnchor="middle"
          className="scurve-axis-title"
          transform={`rotate(-90 14 ${padT + chartH / 2})`}
        >
          Progress (%)
        </text>
        <line x1={padL} y1={padT + chartH} x2={w - padR} y2={padT + chartH} className="scurve-axis" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} className="scurve-axis" />
        <ChartInlineLegend
          x={w - padR - 152}
          y={padT + 6}
          items={[
            { label: "Planned (target)", color: CHART_COLOR_PLANNED },
            { label: "Actual", color: CHART_COLOR_ACTUAL },
          ]}
        />
        <g clipPath="url(#scurvePlotClip)">
          {activeIdx >= 0 && (
            <line
              x1={xs[activeIdx]}
              y1={padT}
              x2={xs[activeIdx]}
              y2={padT + chartH}
              className="scurve-active-week-line"
            />
          )}
          <path d={plannedPath} className="scurve-line-planned" />
          {actualPath ? <path d={actualPath} className="scurve-line-actual" /> : null}
        </g>
        {plannedAll.map((p, i) => {
          const showActual = scurveActualVisible(p, activeAnchor ?? null);
          const dev =
            showActual && p.actual_pct != null
              ? Number(p.actual_pct) - Number(p.planned_pct)
              : undefined;
          const tipRows = [
            {
              legend: "Planned (target)",
              value: fmtPctCell(p.planned_pct),
              tone: "planned" as const,
            },
            ...(showActual
              ? [
                  {
                    legend: "Actual",
                    value: fmtPctCell(p.actual_pct),
                    tone: "actual" as const,
                  },
                  {
                    legend: "Deviasi",
                    value: formatDeviationPct(dev),
                    tone: "neutral" as const,
                  },
                  {
                    legend: "SPI",
                    value:
                      p.spi != null && !Number.isNaN(Number(p.spi))
                        ? Number(p.spi).toFixed(4)
                        : "—",
                    tone: "neutral" as const,
                  },
                ]
              : [
                  {
                    legend: "Actual",
                    value: "Belum tersedia",
                    tone: "neutral" as const,
                  },
                ]),
          ];
          return (
            <g
              key={p.date}
              className="scurve-point-group"
              tabIndex={0}
              role="graphics-symbol"
              aria-label={`Periode ${fmtAnchor(p.date)}: planned ${fmtPctCell(p.planned_pct, 1)}`}
              onMouseEnter={(e) =>
                showTip(e, { title: fmtAnchor(p.date), rows: tipRows })
              }
              onMouseMove={moveTip}
              onFocus={(e) =>
                showTip(e as unknown as ReactMouseEvent, {
                  title: fmtAnchor(p.date),
                  rows: tipRows,
                })
              }
              onBlur={hideTip}
            >
              <rect
                x={xs[i] - (i === 0 || i === n - 1 ? 16 : 14)}
                y={padT}
                width={i === 0 || i === n - 1 ? 32 : 28}
                height={chartH}
                fill="transparent"
                className="scurve-point-hit"
              />
              <circle
                cx={xs[i]}
                cy={plannedYs[i]}
                r={5}
                className="scurve-dot-planned scurve-dot-planned--ring"
              />
              <circle cx={xs[i]} cy={plannedYs[i]} r={2.5} className="scurve-dot-planned" />
              {showActual && p.actual_pct != null && (
                <>
                  <circle
                    cx={xs[i]}
                    cy={y(Number(p.actual_pct))}
                    r={5}
                    className="scurve-dot-actual scurve-dot-actual--ring"
                  />
                  <circle
                    cx={xs[i]}
                    cy={y(Number(p.actual_pct))}
                    r={2.5}
                    className="scurve-dot-actual"
                  />
                </>
              )}
              {(i % labelEvery === 0 || i === n - 1 || i === 0) && (
                <text
                  x={xs[i]}
                  y={xLabelY}
                  textAnchor="end"
                  className="scurve-axis-label scurve-axis-label--anchor"
                  transform={`rotate(-38 ${xs[i]} ${xLabelY})`}
                >
                  {fmtAnchor(p.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      </ChartZoomViewport>
      <ChartPointTooltip tip={tip} />
    </div>
  );
}

export type MilestoneChartItem = {
  id: number;
  name: string;
  weight_pct: number;
  planned_pct: number;
  actual_pct: number;
};

