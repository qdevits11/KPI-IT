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
