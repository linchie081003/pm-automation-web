import {
  ChartPanelToolbar,
  ChartPointTooltip,
  ChartZoomViewport,
  useChartSvgRef,
  useChartTooltip,
  useChartZoom,
} from "../../../components/ChartPanelTools";
import { formatDisplayDate } from "../../../lib/formatDate";
import {
  CHART_COLOR_ACTUAL,
  CHART_COLOR_PLANNED,
  ChartInlineLegend,
} from "./chartHelpers";

export type MilestoneChartItem = {
  id: number;
  name: string;
  weight_pct: number;
  planned_pct: number;
  actual_pct: number;
};

export function MilestoneChart({
  items,
  asOf,
  cutOff: _cutOff,
  statusDateReport,
  activeAnchor,
  projectCode,
  projectName,
}: {
  items: MilestoneChartItem[];
  asOf: string | null;
  cutOff: string | null;
  statusDateReport?: string | null;
  activeAnchor?: string | null;
  projectCode?: string;
  projectName?: string;
}) {
  const svgRef = useChartSvgRef();
  const { zoom, zoomIn, zoomOut, resetZoom } = useChartZoom();
  const { tip, showTip, moveTip, hideTip } = useChartTooltip();
  if (!items.length) {
    return <p className="text-muted">Belum ada milestone/phase untuk grafik progress.</p>;
  }
  const statusLabel = (statusDateReport || asOf)
    ? formatDisplayDate(statusDateReport || asOf!)
    : "—";
  const anchorLabel = activeAnchor ? formatDisplayDate(activeAnchor) : "—";
  const rowH = 36;
  const padL = 168;
  const padR = 48;
  const padB = 40;
  const chartW = 520;
  const legendH = 46;
  const plotTop = legendH + 10;
  const h = plotTop + padB + items.length * rowH;
  const w = padL + chartW + padR;
  const barH = 10;
  const gap = 4;
  const x0 = padL;
  const barMaxW = chartW;
  const plotBottom = h - padB;
  const xAxisLabelY = h - 12;
  const exportBasename = `${(projectCode || "project").replace(/\s+/g, "_")}_milestone`;
  return (
    <div className="scurve-panel scurve-panel--pro milestone-chart-panel scurve-panel--executive">
      <div className="scurve-panel__top scurve-panel__top--executive">
        <div>
          <p className="scurve-panel__kicker">Milestone progress</p>
          <h3 className="scurve-panel__title">
            {projectCode && projectName
              ? `${projectCode} — ${projectName}`
              : projectName || "Milestone chart"}
          </h3>
          <p className="scurve-panel__meta">
            <span className="scurve-meta-pill">
              Status date <strong>{statusLabel}</strong>
            </span>
            {activeAnchor && (
              <span className="scurve-meta-pill">
                Tanggal laporan aktif <strong>{anchorLabel}</strong>
              </span>
            )}
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
      <ChartZoomViewport zoom={zoom}>
      <svg
        ref={svgRef}
        className="scurve-panel__chart milestone-chart-panel__chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Grafik actual vs target per milestone"
        onMouseLeave={hideTip}
      >
        <ChartInlineLegend
          x={x0}
          y={8}
          items={[
            { label: "Target (planned)", color: CHART_COLOR_PLANNED },
            { label: "Actual", color: CHART_COLOR_ACTUAL },
          ]}
        />
        {[0, 25, 50, 75, 100].map((g) => {
          const x = x0 + (g / 100) * barMaxW;
          const anchor =
            g === 0 ? "start" : g === 100 ? "end" : ("middle" as const);
          const tx = g === 100 ? x0 + barMaxW : x;
          return (
            <g key={g}>
              <line
                x1={x}
                y1={plotTop}
                x2={x}
                y2={plotBottom}
                className="scurve-grid-line"
              />
              <text
                x={tx}
                y={xAxisLabelY}
                textAnchor={anchor}
                className="scurve-axis-label scurve-axis-label--milestone-x"
              >
                {g}%
              </text>
            </g>
          );
        })}
        {items.map((m, i) => {
          const yRow = plotTop + i * rowH + rowH / 2;
          const label =
            m.name.length > 22 ? `${m.name.slice(0, 21)}…` : m.name;
          const plannedW = (Math.min(m.planned_pct, 100) / 100) * barMaxW;
          const actualW = (Math.min(m.actual_pct, 100) / 100) * barMaxW;
          const tipRows = [
            {
              legend: "Target (planned)",
              value: `${m.planned_pct.toFixed(2)}%`,
              tone: "planned" as const,
            },
            {
              legend: "Actual",
              value: `${m.actual_pct.toFixed(2)}%`,
              tone: "actual" as const,
            },
            {
              legend: "Bobot",
              value: `${m.weight_pct.toFixed(2)}%`,
              tone: "neutral" as const,
            },
          ];
          return (
            <g
              key={m.id}
              className="milestone-chart-row"
              onMouseEnter={(e) => showTip(e, { title: m.name, rows: tipRows })}
              onMouseMove={moveTip}
            >
              <rect
                x={padL - 160}
                y={yRow - rowH / 2 + 2}
                width={padL + barMaxW + 40}
                height={rowH - 4}
                fill="transparent"
                className="milestone-chart-hit"
              />
              <text
                x={padL - 8}
                y={yRow + 4}
                textAnchor="end"
                className="milestone-chart-panel__label"
                pointerEvents="none"
              >
                {label}
              </text>
              <rect
                x={x0}
                y={yRow - barH - gap}
                width={plannedW}
                height={barH}
                className="milestone-chart-panel__bar milestone-chart-panel__bar--planned"
                rx={2}
                pointerEvents="none"
              />
              <rect
                x={x0}
                y={yRow + gap}
                width={actualW}
                height={barH}
                className="milestone-chart-panel__bar milestone-chart-panel__bar--actual"
                rx={2}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      </ChartZoomViewport>
      <ChartPointTooltip tip={tip} />
    </div>
  );
}

export type WeeklyReportPeriodOption = {
  report_date?: string;
  anchor_date: string;
  period_start?: string;
  cut_off_date: string;
};

