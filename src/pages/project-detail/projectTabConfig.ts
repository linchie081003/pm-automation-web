/** Opt-in only — tab Timeline Editor (Beta) disembunyikan dari UI produksi. */
export const TIMELINE_BETA_TAB_ENABLED =
  import.meta.env.VITE_SHOW_TIMELINE_BETA_TAB === "true" &&
  import.meta.env.VITE_HIDE_TIMELINE_BETA_TAB !== "true";

export const PROJECT_TABS_BASE = [
  { id: "sph", label: "SPH" },
  { id: "po", label: "PO" },
  { id: "pre_kickoff", label: "Kick Off" },
  { id: "milestones", label: "Timeline" },
  { id: "timeline_editor_beta", label: "Timeline Editor (Beta)" },
  { id: "change_requests", label: "Change Request" },
  { id: "clickup", label: "ClickUp" },
  { id: "evaluation", label: "Task" },
  { id: "reports", label: "Reports" },
  { id: "members", label: "Members" },
  { id: "documents", label: "Documents" },
  { id: "reminders", label: "Reminders" },
  { id: "audit", label: "Audit trail" },
  { id: "bast", label: "Closing" },
] as const;

export const PROJECT_TABS = PROJECT_TABS_BASE.filter(
  (t) => t.id !== "timeline_editor_beta" || TIMELINE_BETA_TAB_ENABLED,
);

export const PROJECT_TAB_IDS: Set<string> = new Set(PROJECT_TABS.map((t) => t.id));

export const PHASE_NEXT_LABEL: Record<string, string> = {
  kickoff: "Kick Off",
  in_delivery: "Project Start",
  bast: "BAST / evaluasi",
  closed: "Closing (done)",
};
