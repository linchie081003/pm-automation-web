/** Sidebar utama — item hanya tampil jika user punya minimal satu permission terkait. */

export type MainNavItem = {
  to: string;
  label: string;
  /** Kosong = semua user login. Satu atau lebih permission (OR). */
  anyPerm?: string[];
  isActive: (pathname: string) => boolean;
};

/** Permission untuk menu Setting (sama dengan tile di /config). */
export const CONFIG_MENU_ANY_PERM = [
  "users.read",
  "roles.read",
  "health.config.write",
  "projects.write",
  "integrations.clickup.configure",
  "integrations.google_drive.configure",
] as const;

export const MAIN_NAV_ITEMS: MainNavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    isActive: (p) => p === "/",
  },
  {
    to: "/projects",
    label: "Proyek",
    isActive: (p) => p.startsWith("/projects"),
  },
  {
    to: "/approvals",
    label: "Approval",
    /** Bukan approvals.request — hanya approver gate. */
    anyPerm: ["approvals.decide"],
    isActive: (p) => p === "/approvals" || p.startsWith("/approvals/"),
  },
  {
    to: "/rebaseline-approvals",
    label: "Rebaseline",
    /** Bukan rebaseline.request / schedule.rebaseline — hanya halaman approve. */
    anyPerm: ["rebaseline.approve"],
    isActive: (p) => p.startsWith("/rebaseline-approvals"),
  },
  {
    to: "/config",
    label: "Setting",
    anyPerm: [...CONFIG_MENU_ANY_PERM],
    isActive: (p) => p.startsWith("/config") || p === "/setting",
  },
];

export function canAnyPerm(
  can: (perm: string) => boolean,
  perms: readonly string[] | undefined,
): boolean {
  if (!perms?.length) return true;
  return perms.some((p) => can(p));
}

export function visibleMainNavItems(
  can: (perm: string) => boolean,
): MainNavItem[] {
  return MAIN_NAV_ITEMS.filter((item) => canAnyPerm(can, item.anyPerm));
}
