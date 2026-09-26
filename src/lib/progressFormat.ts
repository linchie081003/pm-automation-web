export function formatDeviationPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${Number(v).toFixed(2)}%`;
}

export function deviationFromTargetActual(
  target: number | null | undefined,
  actual: number | null | undefined,
): number | null {
  if (target == null || actual == null) return null;
  return Math.round((actual - target) * 100) / 100;
}
