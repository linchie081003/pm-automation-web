const SVG_EXPORT_STYLES = `
.scurve-plot-bg{fill:#fff;stroke:#e2e8f0;stroke-width:1}
.scurve-grid-line{stroke:#e8edf3;stroke-width:1}
.scurve-axis{stroke:#94a3b8;stroke-width:1}
.scurve-axis-label{fill:#64748b;font-size:11px;font-family:system-ui,sans-serif}
.scurve-axis-label--anchor{font-size:10px;fill:#475569;font-weight:500}
.scurve-axis-title{fill:#64748b;font-size:11px;font-weight:600;font-family:system-ui,sans-serif}
.scurve-active-week-line{stroke:#6366f1;stroke-width:1.5;stroke-dasharray:4 4;opacity:.65}
.scurve-line-planned{fill:none;stroke:#2563eb;stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round}
.scurve-line-actual{fill:none;stroke:#059669;stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round}
.scurve-dot-planned{fill:#2563eb}
.scurve-dot-planned--ring{fill:rgba(37,99,235,.15);stroke:#2563eb;stroke-width:1.25}
.scurve-dot-actual{fill:#059669}
.scurve-dot-actual--ring{fill:rgba(5,150,105,.12);stroke:#059669;stroke-width:1.25}
.scurve-point-value{font-size:9px;font-weight:700;font-family:system-ui,sans-serif}
.scurve-point-value--planned{fill:#1d4ed8}
.scurve-point-value--actual{fill:#047857}
.milestone-chart-panel__label{fill:#334155;font-size:11px;font-family:system-ui,sans-serif}
.milestone-chart-panel__bar--planned{fill:#2563eb}
.milestone-chart-panel__bar--actual{fill:#16a34a}
`;

function prepareSvgClone(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = SVG_EXPORT_STYLES;
  clone.insertBefore(style, clone.firstChild);
  return clone;
}

export async function downloadSvgChart(
  svg: SVGSVGElement,
  basename: string,
  format: "png" | "jpeg",
  scale = 2,
): Promise<void> {
  const clone = prepareSvgClone(svg);
  const vb = clone.viewBox.baseVal;
  const w = vb.width > 0 ? vb.width : svg.clientWidth || 960;
  const h = vb.height > 0 ? vb.height : svg.clientHeight || 400;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));

  const svgString = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Gagal merender grafik untuk export"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia");

    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const quality = format === "jpeg" ? 0.92 : undefined;
    const dataUrl = canvas.toDataURL(mime, quality);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${basename}.${format === "jpeg" ? "jpg" : "png"}`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
