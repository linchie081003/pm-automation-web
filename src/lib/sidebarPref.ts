const KEY = "pdc-sidebar-open";

export function readSidebarOpen(defaultOpen = true): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "false") return false;
    if (v === "true") return true;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

export function writeSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY, open ? "true" : "false");
  } catch {
    /* ignore */
  }
}
