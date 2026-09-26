import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { downloadSvgChart } from "../lib/chartExport";

export type ChartTooltipRow = {
  legend: string;
  value: string;
  tone?: "planned" | "actual" | "neutral";
};

export type ChartTooltipState = {
  clientX: number;
  clientY: number;
  title?: string;
  rows: ChartTooltipRow[];
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

export function useChartTooltip() {
  const [tip, setTip] = useState<ChartTooltipState | null>(null);
  const showTip = useCallback(
    (e: ReactMouseEvent, payload: Omit<ChartTooltipState, "clientX" | "clientY">) => {
      setTip({
        ...payload,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    },
    [],
  );
  const moveTip = useCallback((e: ReactMouseEvent) => {
    setTip((prev) =>
      prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null,
    );
  }, []);
  const hideTip = useCallback(() => setTip(null), []);
  return { tip, showTip, moveTip, hideTip };
}

export function ChartPointTooltip({ tip }: { tip: ChartTooltipState | null }) {
  if (!tip) return null;
  return createPortal(
    <div
      className="chart-point-tooltip"
      role="tooltip"
      style={{
        left: Math.min(tip.clientX + 14, window.innerWidth - 240),
        top: Math.min(tip.clientY + 14, window.innerHeight - 160),
      }}
    >
      {tip.title ? <p className="chart-point-tooltip__title">{tip.title}</p> : null}
      <ul className="chart-point-tooltip__list">
        {tip.rows.map((row) => (
          <li key={row.legend} className={`chart-point-tooltip__row chart-point-tooltip__row--${row.tone ?? "neutral"}`}>
            <span className="chart-point-tooltip__legend">{row.legend}</span>
            <span className="chart-point-tooltip__value">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

export function ChartPanelToolbar({
  svgRef,
  exportBasename,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  exportBasename: string;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const doExport = async (format: "png" | "jpeg") => {
    const svg = svgRef.current;
    if (!svg) return;
    setExportErr("");
    setExportBusy(true);
    try {
      await downloadSvgChart(svg, exportBasename, format);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Export gagal");
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="chart-panel-toolbar" aria-label="Kontrol grafik">
      <div className="chart-panel-toolbar__group">
        <span className="chart-panel-toolbar__label">Zoom</span>
        <button type="button" onClick={onZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <span className="chart-panel-toolbar__zoom-pct">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={onZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={onZoomReset} disabled={zoom === 1} title="Reset zoom">
          Reset
        </button>
      </div>
      <div className="chart-panel-toolbar__group">
        <span className="chart-panel-toolbar__label">Download</span>
        <button type="button" disabled={exportBusy} onClick={() => void doExport("png")}>
          PNG
        </button>
        <button type="button" disabled={exportBusy} onClick={() => void doExport("jpeg")}>
          JPEG
        </button>
      </div>
      {exportErr ? <span className="chart-panel-toolbar__err">{exportErr}</span> : null}
    </div>
  );
}

export function ChartZoomViewport({
  zoom,
  children,
}: {
  zoom: number;
  children: ReactNode;
}) {
  return (
    <div className="chart-panel-viewport">
      <div
        className="chart-panel-zoom-inner"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          width: `${100 / zoom}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function useChartZoom(initial = 1) {
  const [zoom, setZoom] = useState(initial);
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const resetZoom = () => setZoom(1);
  return { zoom, zoomIn, zoomOut, resetZoom };
}

export function useChartSvgRef() {
  return useRef<SVGSVGElement | null>(null);
}
