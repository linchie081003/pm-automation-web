export type ScurvePointRow = {
  date: string;
  planned_pct: number;
  actual_pct: number | null;
  spi: number | null;
  cut_off_date?: string;
};

export function fmtPctCell(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(digits)}%`;
}

export function scurveActualVisible(
  point: ScurvePointRow,
  activeAnchor: string | null,
): boolean {
  if (point.actual_pct == null || Number.isNaN(Number(point.actual_pct))) return false;
  if (!activeAnchor) return true;
  return point.date <= activeAnchor;
}

export function straightLinePath(xs: number[], ys: number[]): string {
  if (!xs.length) return "";
  if (xs.length === 1) return `M ${xs[0]} ${ys[0]}`;
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i += 1) {
    d += ` L ${xs[i]} ${ys[i]}`;
  }
  return d;
}

export const CHART_COLOR_PLANNED = "#2563eb";
export const CHART_COLOR_ACTUAL = "#b45309";

export function ChartInlineLegend({
  x,
  y,
  items,
}: {
  x: number;
  y: number;
  items: { label: string; color: string }[];
}) {
  const rowH = 17;
  const pad = 8;
  const boxW = 148;
  const boxH = pad * 2 + items.length * rowH - 4;
  return (
    <g className="chart-inline-legend" transform={`translate(${x}, ${y})`}>
      <rect
        x={0}
        y={0}
        width={boxW}
        height={boxH}
        rx={6}
        className="chart-inline-legend__bg"
      />
      {items.map((it, i) => (
        <g key={it.label} transform={`translate(${pad}, ${pad + i * rowH})`}>
          <line
            x1={0}
            y1={5}
            x2={20}
            y2={5}
            stroke={it.color}
            strokeWidth={2.75}
            strokeLinecap="round"
          />
          <text x={26} y={9} className="chart-inline-legend__label">
            {it.label}
          </text>
        </g>
      ))}
    </g>
  );
}
