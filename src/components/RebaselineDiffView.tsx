import { formatDisplayDate } from "../lib/formatDate";

export type RebaselineDiffPayload = {
  category?: "delay" | "scope_change";
  effective_from?: string;
  baseline_version?: number | null;
  diff?: {
    added?: Array<Record<string, unknown>>;
    removed?: Array<Record<string, unknown>>;
    modified?: Array<Record<string, unknown>>;
  };
  presentation?: {
    primary_sections?: string[];
    cross_category_warnings?: string[];
  };
  validation?: {
    blocking_errors?: string[];
    warnings?: string[];
  };
};

function fmtDate(v: unknown): string {
  if (!v || typeof v !== "string") return "—";
  return formatDisplayDate(v);
}

export function RebaselineDiffView({ payload }: { payload: RebaselineDiffPayload | null | undefined }) {
  if (!payload?.diff) {
    return <p className="text-muted">Belum ada diff usulan.</p>;
  }
  const { diff, presentation, validation, category, effective_from, baseline_version } = payload;
  const primary = presentation?.primary_sections ?? [];
  const emphasizeDates = category === "delay" || primary.includes("dates");
  const emphasizeStructure = category === "scope_change" || primary.includes("structure_weights");

  return (
    <div className="rebaseline-diff">
      <p className="text-muted">
        Baseline v{baseline_version ?? "—"} · efektif dari {fmtDate(effective_from)} · kategori{" "}
        {category === "scope_change" ? "Perubahan scope" : "Keterlambatan"}
      </p>
      {(presentation?.cross_category_warnings ?? []).map((w) => (
        <p key={w} className="notice notice-warning">
          {w}
        </p>
      ))}
      {(validation?.blocking_errors ?? []).map((e) => (
        <p key={e} className="notice notice-error">
          {e}
        </p>
      ))}
      {(validation?.warnings ?? []).map((w) => (
        <p key={w} className="notice notice-info">
          {w}
        </p>
      ))}

      {emphasizeStructure && (diff.added?.length ?? 0) > 0 && (
        <section>
          <h4 className="subsection-title">Fase baru</h4>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Target</th>
                <th className="num">Bobot %</th>
              </tr>
            </thead>
            <tbody>
              {diff.added!.map((row, i) => (
                <tr key={i}>
                  <td>{String(row.name ?? "")}</td>
                  <td>{fmtDate(row.target_date)}</td>
                  <td className="num">{String(row.weight_pct ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {emphasizeStructure && (diff.removed?.length ?? 0) > 0 && (
        <section>
          <h4 className="subsection-title">Fase dihapus</h4>
          <ul>
            {diff.removed!.map((row, i) => (
              <li key={i}>
                {String(row.name ?? "")} ({fmtDate(row.target_date)}, {String(row.weight_pct ?? "")}%)
              </li>
            ))}
          </ul>
        </section>
      )}

      {(diff.modified?.length ?? 0) > 0 && (
        <section>
          <h4 className="subsection-title">Fase diubah</h4>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Nama</th>
                {emphasizeDates && (
                  <>
                    <th>Start (dari → ke)</th>
                    <th>Target (dari → ke)</th>
                  </>
                )}
                {emphasizeStructure && <th className="num">Bobot (dari → ke)</th>}
              </tr>
            </thead>
            <tbody>
              {diff.modified!.map((row, i) => {
                const start = row.start_date as { from?: string; to?: string } | undefined;
                const target = row.target_date as { from?: string; to?: string } | undefined;
                const weight = row.weight_pct as { from?: number; to?: number } | undefined;
                return (
                  <tr key={i}>
                    <td>{String(row.name ?? "")}</td>
                    {emphasizeDates && (
                      <>
                        <td>
                          {start ? `${fmtDate(start.from)} → ${fmtDate(start.to)}` : "—"}
                        </td>
                        <td>
                          {target ? `${fmtDate(target.from)} → ${fmtDate(target.to)}` : "—"}
                        </td>
                      </>
                    )}
                    {emphasizeStructure && (
                      <td className="num">
                        {weight ? `${weight.from} → ${weight.to}` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
