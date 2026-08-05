/**
 * Rôles KPI·IT — basés sur l’email de la session (OAuth / connexion).
 *
 * - admin : menus Configuration, Sync Jira, Formules
 * - responsable KPI : encodage « Retour sur la semaine »
 * - user : reste de l’app
 */

export const DEFAULT_ADMIN_EMAIL = "q.devits@coverseal.com";

export type AppRole = "admin" | "user";

export interface AppUser {
  email: string;
  displayName?: string;
  role: AppRole;
}

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Admins (menus config / sync / formules). */
export function adminEmails(): string[] {
  const fromEnv = parseEmailList(process.env.KPI_ADMIN_EMAILS);
  if (fromEnv.length > 0) return fromEnv;
  return [DEFAULT_ADMIN_EMAIL];
}

/** Responsables KPI (encodage → Retour). Par défaut = admins. */
export function kpiResponsibleEmails(): string[] {
  const fromEnv = parseEmailList(process.env.KPI_RESPONSIBLE_EMAILS);
  if (fromEnv.length > 0) return fromEnv;
  return adminEmails();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function roleForEmail(email: string): AppRole {
  const e = normalizeEmail(email);
  return adminEmails().includes(e) ? "admin" : "user";
}

export function buildAppUser(
  email: string,
  displayName?: string,
): AppUser {
  const normalized = normalizeEmail(email);
  return {
    email: normalized,
    displayName: displayName?.trim() || undefined,
    role: roleForEmail(normalized),
  };
}

export function isAdmin(user: AppUser | null | undefined): boolean {
  return user?.role === "admin";
}

export function isKpiResponsible(user: AppUser | null | undefined): boolean {
  if (!user?.email) return false;
  return kpiResponsibleEmails().includes(normalizeEmail(user.email));
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
