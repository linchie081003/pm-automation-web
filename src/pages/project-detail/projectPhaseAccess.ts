import type { ProjectDetail } from "./projectDetailTypes";

export const DELIVERY_PHASES = new Set(["in_delivery", "bast", "closed"]);

export const TAB_READONLY_MSG = {
  sph: "SPH hanya baca — sudah lanjut ke fase Kick Off.",
  kickoff: "Kick Off hanya baca — proyek sudah in delivery.",
  po: "PO hanya baca — proyek sudah closed.",
} as const;

export function priorPhasesReadOnly(detail: ProjectDetail): boolean {
  return DELIVERY_PHASES.has(detail.current_phase);
}

export function poTabReadOnly(detail: ProjectDetail): boolean {
  return detail.current_phase === "closed" || detail.status === "closed";
}

export function poFormComplete(form: {
  po_no: string;
  po_name: string;
  po_due_date: string;
  service_items: { name: string }[];
}): boolean {
  const hasNo = Boolean(form.po_no.trim());
  const hasDue = Boolean(form.po_due_date);
  const hasItems = form.service_items.some((s) => s.name.trim());
  const hasTitle = Boolean(form.po_name.trim());
  return hasNo && hasDue && (hasItems || hasTitle);
}

export function sphTimelineEditable(detail: ProjectDetail): boolean {
  if (detail.kickoff_timeline_confirmed_at) return false;
  return !["kickoff", "in_delivery", "bast", "closed"].includes(detail.current_phase);
}

export function milestoneStructureEditable(detail: ProjectDetail): boolean {
  if (detail.delivery_started_at) return false;
  return detail.current_phase === "pre_kickoff" || detail.current_phase === "kickoff";
}

export function milestoneProgressEditable(detail: ProjectDetail): boolean {
  if (milestoneStructureEditable(detail)) return true;
  return detail.current_phase === "in_delivery" || detail.current_phase === "bast";
}

export function timelineProjectStartEditable(detail: ProjectDetail): boolean {
  return !!detail.kickoff_timeline_confirmed_at && detail.current_phase !== "closed";
}
