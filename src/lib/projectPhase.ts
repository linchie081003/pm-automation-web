/** Label fase proyek — konsisten di list, detail, dashboard. */
export const PROJECT_PHASE_LABEL: Record<string, string> = {
  po_received: "SPH",
  pre_kickoff: "Kick Off",
  kickoff: "Kick Off",
  in_delivery: "In delivery",
  bast: "BAST",
  closed: "Closed",
};

export function formatProjectPhase(phase: string | null | undefined): string {
  if (!phase) return "—";
  return PROJECT_PHASE_LABEL[phase] ?? phase.replace(/_/g, " ");
}
