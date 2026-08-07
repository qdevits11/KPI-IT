/**
 * Droits d’accès KPI·IT — flags indépendants (cases à cocher).
 * Un utilisateur peut cumuler admin, responsable KPI et responsable d’encodage.
 */

import type { AppAccessUser } from "./types";

export type { AppAccessUser };

export const DEFAULT_ADMIN_EMAIL = "q.devits@coverseal.com";

export interface AppUser {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  isAdmin: boolean;
  isKpiResponsible: boolean;
  isEncodingResponsible: boolean;
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

function emptyFlags(): {
  isAdmin: boolean;
  isKpiResponsible: boolean;
  isEncodingResponsible: boolean;
} {
  return {
    isAdmin: false,
    isKpiResponsible: false,
    isEncodingResponsible: false,
  };
}

/** Liste initiale si la base n’a pas encore de droits. */
export function defaultAccessUsers(): AppAccessUser[] {
  const now = new Date().toISOString();
  const byEmail = new Map<string, AppAccessUser>();

  const upsert = (
    email: string,
    flags: {
      isAdmin?: boolean;
      isKpiResponsible?: boolean;
      isEncodingResponsible?: boolean;
    },
  ) => {
    const e = normalizeEmail(email);
    if (!e) return;
    const prev = byEmail.get(e);
    byEmail.set(e, {
      email: e,
      displayName: prev?.displayName,
      avatarUrl: prev?.avatarUrl,
      isAdmin: Boolean(prev?.isAdmin || flags.isAdmin),
      isKpiResponsible: Boolean(
        prev?.isKpiResponsible || flags.isKpiResponsible,
      ),
      isEncodingResponsible: Boolean(
        prev?.isEncodingResponsible || flags.isEncodingResponsible,
      ),
      lastLoginAt: prev?.lastLoginAt,
      updatedAt: now,
    });
  };

  upsert(DEFAULT_ADMIN_EMAIL, {
    isAdmin: true,
    isKpiResponsible: true,
    isEncodingResponsible: true,
  });
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

function laterIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Normalise la liste des comptes.
 * Garantit au moins un admin sans effacer les utilisateurs déjà enregistrés.
 */
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
    const flags = emptyFlags();
    byEmail.set(email, {
      email,
      displayName:
        raw.displayName?.trim() || prev?.displayName || undefined,
      avatarUrl: raw.avatarUrl?.trim() || prev?.avatarUrl || undefined,
      isAdmin: Boolean(raw.isAdmin || prev?.isAdmin || flags.isAdmin),
      isKpiResponsible: Boolean(
        raw.isKpiResponsible || prev?.isKpiResponsible || flags.isKpiResponsible,
      ),
      isEncodingResponsible: Boolean(
        raw.isEncodingResponsible ||
          prev?.isEncodingResponsible ||
          flags.isEncodingResponsible,
      ),
      lastLoginAt: laterIso(raw.lastLoginAt, prev?.lastLoginAt),
      updatedAt: laterIso(raw.updatedAt, prev?.updatedAt),
    });
  }

  const list = [...byEmail.values()];
  if (!list.some((u) => u.isAdmin)) {
    for (const d of defaultAccessUsers()) {
      const existing = list.find((u) => u.email === d.email);
      if (existing) {
        existing.isAdmin = true;
        existing.isKpiResponsible =
          existing.isKpiResponsible || d.isKpiResponsible;
        existing.isEncodingResponsible =
          existing.isEncodingResponsible || d.isEncodingResponsible;
      } else {
        list.push(d);
      }
    }
  }

  return list.sort((a, b) => a.email.localeCompare(b.email, "fr"));
}

export function buildAppUser(
  email: string,
  displayName?: string,
  rights?: {
    isAdmin?: boolean;
    isKpiResponsible?: boolean;
    isEncodingResponsible?: boolean;
  },
  avatarUrl?: string,
): AppUser {
  return {
    email: normalizeEmail(email),
    displayName: displayName?.trim() || undefined,
    avatarUrl: avatarUrl?.trim() || undefined,
    isAdmin: Boolean(rights?.isAdmin),
    isKpiResponsible: Boolean(rights?.isKpiResponsible),
    isEncodingResponsible: Boolean(rights?.isEncodingResponsible),
  };
}

export function rightsFromAccessEntry(
  entry: AppAccessUser | undefined,
): {
  isAdmin: boolean;
  isKpiResponsible: boolean;
  isEncodingResponsible: boolean;
} {
  return {
    isAdmin: Boolean(entry?.isAdmin),
    isKpiResponsible: Boolean(entry?.isKpiResponsible),
    isEncodingResponsible: Boolean(entry?.isEncodingResponsible),
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

export function isEncodingResponsible(
  user: AppUser | null | undefined,
): boolean {
  return Boolean(user?.isEncodingResponsible);
}

/** Admin (shell /admin et anciennes URLs). */
export function canAccessAdminPages(user: AppUser | null | undefined): boolean {
  return isAdmin(user);
}

/** Retour sur la semaine (accueil). */
export function canEditWeekRetour(user: AppUser | null | undefined): boolean {
  return isKpiResponsible(user);
}

/** Chemins réservés aux administrateurs (nav + garde). */
export function isAdminNavHref(href: string): boolean {
  return href === "/admin" || href.startsWith("/admin/");
}

export function formatUserBadges(user: AppUser): string {
  const bits: string[] = [];
  if (user.isAdmin) bits.push("admin");
  if (user.isKpiResponsible) bits.push("KPI");
  if (user.isEncodingResponsible) bits.push("encodage");
  if (bits.length === 0) bits.push("user");
  return bits.join(" · ");
}

/** Libellé d’encodage (nom affiché, sinon partie locale de l’email). */
export function encodingLabel(user: AppAccessUser): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const local = user.email.split("@")[0]?.trim();
  return local || user.email;
}
