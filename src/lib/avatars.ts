/**
 * Avatars Jira — annuaire displayName → avatarUrl (alimenté à la sync / tickets live).
 */

export type JiraAvatarUrls = {
  "16x16"?: string;
  "24x24"?: string;
  "32x32"?: string;
  "48x48"?: string;
};

export type PersonDirectoryEntry = {
  displayName: string;
  accountId?: string;
  avatarUrl?: string;
  updatedAt: string;
};

/** Clé = nom affiché Jira (displayName). */
export type PeopleDirectory = Record<string, PersonDirectoryEntry>;

const SKIP_NAMES = new Set([
  "non assigné",
  "inconnu",
  "unassigned",
  "unknown",
]);

export function shouldSkipPersonName(name: string): boolean {
  return SKIP_NAMES.has(name.trim().toLowerCase());
}

export function pickAvatarUrl(
  avatarUrls: JiraAvatarUrls | Record<string, string> | null | undefined,
  preferred: keyof JiraAvatarUrls = "48x48",
): string | undefined {
  if (!avatarUrls || typeof avatarUrls !== "object") return undefined;
  const order: (keyof JiraAvatarUrls)[] = [
    preferred,
    "48x48",
    "32x32",
    "24x24",
    "16x16",
  ];
  for (const key of order) {
    const url = avatarUrls[key]?.trim();
    if (url) return url;
  }
  for (const url of Object.values(avatarUrls)) {
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return undefined;
}

/** Tailles CDN Atlassian courantes (au-delà de 48 pour écrans Retina). */
const AVATAR_TARGET_SIZES = [48, 64, 96, 128, 192, 256] as const;

/**
 * Demande une variante plus nette d’une URL avatar Atlassian/Jira.
 * Les API ne renvoient que 48×48 max ; le CDN accepte souvent `size` / `s`
 * plus élevés — utile pour les macarons xl (~56px CSS ≈ 112px physiques).
 */
export function hiResAvatarUrl(
  url: string | null | undefined,
  displayPx: number,
): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;

  // 2× pour Retina, plafond CDN raisonnable
  const want = Math.min(256, Math.max(48, Math.ceil(displayPx * 2)));
  const target =
    AVATAR_TARGET_SIZES.find((s) => s >= want) ??
    AVATAR_TARGET_SIZES[AVATAR_TARGET_SIZES.length - 1];

  try {
    const parsed = new URL(raw);
    let changed = false;

    for (const key of ["size", "s"] as const) {
      if (!parsed.searchParams.has(key)) continue;
      const current = Number(parsed.searchParams.get(key));
      if (Number.isFinite(current) && current < target) {
        parsed.searchParams.set(key, String(target));
        changed = true;
      }
    }

    // Chemins …/48 ou …/48x48 (CDN / secure)
    const pathUp = parsed.pathname.replace(
      /\/(\d{2,3})x\1(?=\/|$)/,
      `/${target}x${target}`,
    );
    if (pathUp !== parsed.pathname) {
      parsed.pathname = pathUp;
      changed = true;
    } else {
      const pathNum = parsed.pathname.replace(
        /\/(16|24|32|48|64|96)(?=\/|$)/,
        `/${target}`,
      );
      if (pathNum !== parsed.pathname) {
        parsed.pathname = pathNum;
        changed = true;
      }
    }

    // Ancien format ?size=large|medium|… (secure/useravatar)
    const named = parsed.searchParams.get("size");
    if (
      named &&
      !/^\d+$/.test(named) &&
      !/xlarge/i.test(named) &&
      target >= 96
    ) {
      parsed.searchParams.set("size", "xlarge");
      changed = true;
    }

    return changed ? parsed.toString() : raw;
  } catch {
    return raw;
  }
}

export function personEntryFromJiraUser(
  user:
    | {
        displayName?: string;
        emailAddress?: string;
        accountId?: string;
        avatarUrls?: JiraAvatarUrls;
      }
    | null
    | undefined,
  fallbackName?: string,
): PersonDirectoryEntry | null {
  if (!user) return null;
  const displayName =
    user.displayName?.trim() ||
    fallbackName?.trim() ||
    user.emailAddress?.trim() ||
    user.accountId?.trim() ||
    "";
  if (!displayName || shouldSkipPersonName(displayName)) return null;
  const avatarUrl = pickAvatarUrl(user.avatarUrls);
  if (!avatarUrl && !user.accountId) return null;
  return {
    displayName,
    accountId: user.accountId?.trim() || undefined,
    avatarUrl,
    updatedAt: new Date().toISOString(),
  };
}

export function mergePeopleDirectory(
  current: PeopleDirectory | undefined | null,
  incoming: PersonDirectoryEntry[],
): PeopleDirectory {
  const next: PeopleDirectory = { ...(current ?? {}) };
  for (const entry of incoming) {
    if (!entry.displayName || shouldSkipPersonName(entry.displayName)) continue;
    const prev = next[entry.displayName];
    next[entry.displayName] = {
      displayName: entry.displayName,
      accountId: entry.accountId || prev?.accountId,
      avatarUrl: entry.avatarUrl || prev?.avatarUrl,
      updatedAt: entry.updatedAt || prev?.updatedAt || new Date().toISOString(),
    };
  }
  return next;
}

export function avatarForName(
  directory: PeopleDirectory | undefined | null,
  name: string,
): string | undefined {
  if (!name || shouldSkipPersonName(name)) return undefined;
  return directory?.[name]?.avatarUrl;
}

export function initialsFromName(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
