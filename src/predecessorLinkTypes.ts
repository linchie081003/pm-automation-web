/** MS Project–style predecessor dependency types (hari kerja). */

export type PredecessorLinkType = "FS" | "SS" | "FF" | "SF";

export const PREDECESSOR_LINK_OPTIONS: {
  value: PredecessorLinkType;
  label: string;
  hint: string;
}[] = [
  {
    value: "FS",
    label: "FS — Finish-to-Start",
    hint: "Mulai successor setelah predecessor selesai",
  },
  {
    value: "SS",
    label: "SS — Start-to-Start",
    hint: "Mulai successor sejajar dengan mulai predecessor",
  },
  {
    value: "FF",
    label: "FF — Finish-to-Finish",
    hint: "Selesai successor sejajar dengan selesai predecessor",
  },
  {
    value: "SF",
    label: "SF — Start-to-Finish",
    hint: "Selesai successor saat predecessor mulai (jarang dipakai)",
  },
];

export function normalizePredecessorLinkType(raw: string | null | undefined): PredecessorLinkType {
  const u = (raw ?? "FS").trim().toUpperCase();
  if (u === "SS" || u === "FF" || u === "SF") return u;
  return "FS";
}
