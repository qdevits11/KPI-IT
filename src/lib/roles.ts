/**
 * Droits d’accès KPI·IT — flags indépendants (cases à cocher).
 * Un utilisateur peut être admin ET responsable KPI.
 */

import type { AppAccessUser } from "./types";

export type { AppAccessUser };

export const DEFAULT_ADMIN_EMAIL = "q.devits@coverseal.com";

export interface AppUser {
  email: string;
  displayName?: string;
  isAdmin: boolean;
  isKpiResponsible: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Liste initiale si la base n’a pas encore de droits. */
export function defaultAccessUsers(): AppAccessUser[] {
  const now = new Date().toISOString();
  const byEmail = new Map<string, AppAccessUser>();

  const upsert = (
    email: string,
    flags: { isAdmin?: boolean; isKpiResponsible?: boolean },
  ) => {
    const e = normalizeEmail(email);
    if (!e) return;
    const prev = byEmail.get(e);
    byEmail.set(e, {
      email: e,
      displayName: prev?.displayName,
      isAdmin: Boolean(prev?.isAdmin || flags.isAdmin),
      isKpiResponsible: Boolean(
        prev?.isKpiResponsible || flags.isKpiResponsible,
      ),
      updatedAt: now,
    });
  };

  upsert(DEFAULT_ADMIN_EMAIL, { isAdmin: true, isKpiResponsible: true });
  for (const e of parseEmailList(process.env.KPI_ADMIN_EMAILS)) {
    upsert(e, { isAdmin: true });
  }
  for (const e of parseEmailList(process.env.KPI_RESPONSIBLE_EMAILS)) {
    upsert(e, { isKpiResponsible: true });
  }

  return [...byEmail.values()].sort((a, b) =>
    a.email.localeCompare(b.email, "fr"),
  );
}

export function normalizeAccessUsers(
  users: AppAccessUser[] | undefined | null,
): AppAccessUser[] {
  if (!Array.isArray(users) || users.length === 0) {
    return defaultAccessUsers();
  }
  const byEmail = new Map<string, AppAccessUser>();
  for (const raw of users) {
    const email = normalizeEmail(raw?.email ?? "");
    if (!email) continue;
    const prev = byEmail.get(email);
    byEmail.set(email, {
      email,
      displayName:
        raw.displayName?.trim() || prev?.displayName || undefined,
      isAdmin: Boolean(raw.isAdmin || prev?.isAdmin),
      isKpiResponsible: Boolean(
        raw.isKpiResponsible || prev?.isKpiResponsible,
      ),
      updatedAt: raw.updatedAt || prev?.updatedAt,
    });
  }
  const list = [...byEmail.values()];
  if (!list.some((u) => u.isAdmin)) {
    return defaultAccessUsers();
  }
  return list.sort((a, b) => a.email.localeCompare(b.email, "fr"));
}

export function buildAppUser(
  email: string,
  displayName?: string,
  rights?: { isAdmin?: boolean; isKpiResponsible?: boolean },
): AppUser {
  return {
    email: normalizeEmail(email),
    displayName: displayName?.trim() || undefined,
    isAdmin: Boolean(rights?.isAdmin),
    isKpiResponsible: Boolean(rights?.isKpiResponsible),
  };
}

export function rightsFromAccessEntry(
  entry: AppAccessUser | undefined,
): { isAdmin: boolean; isKpiResponsible: boolean } {
  return {
    isAdmin: Boolean(entry?.isAdmin),
    isKpiResponsible: Boolean(entry?.isKpiResponsible),
  };
}

export function findAccessUser(
  users: AppAccessUser[],
  email: string,
): AppAccessUser | undefined {
  const e = normalizeEmail(email);
  return users.find((u) => u.email === e);
}

export function isAdmin(user: AppUser | null | undefined): boolean {
  return Boolean(user?.isAdmin);
}

export function isKpiResponsible(user: AppUser | null | undefined): boolean {
  return Boolean(user?.isKpiResponsible);
}

/** Configuration, Sync Jira, Formules */
export function canAccessAdminPages(user: AppUser | null | undefined): boolean {
  return isAdmin(user);
}

/** Onglet Encodage → Retour */
export function canEditWeekRetour(user: AppUser | null | undefined): boolean {
  return isKpiResponsible(user);
}

export type AdminNavHref = "/configuration" | "/jira" | "/formules";

export const ADMIN_NAV_HREFS: AdminNavHref[] = [
  "/configuration",
  "/jira",
  "/formules",
];

export function isAdminNavHref(href: string): href is AdminNavHref {
  return (ADMIN_NAV_HREFS as string[]).includes(href);
}

export function formatUserBadges(user: AppUser): string {
  const bits: string[] = [];
  if (user.isAdmin) bits.push("admin");
  if (user.isKpiResponsible) bits.push("KPI");
  if (bits.length === 0) bits.push("user");
  return bits.join(" · ");
}
