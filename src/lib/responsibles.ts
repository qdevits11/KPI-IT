/** Responsables autorisés pour l'encodage manuel (liste configurable). */

export const DEFAULT_RESPONSIBLES = [
  "Dominique",
  "Gary",
  "Loic",
  "Quentin",
] as const;

export function normalizeResponsibleName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function sortResponsibles(names: string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );
}

export function isAllowedResponsible(
  name: string,
  allowed: string[],
): boolean {
  const n = normalizeResponsibleName(name);
  return allowed.some(
    (a) => a.localeCompare(n, "fr", { sensitivity: "base" }) === 0,
  );
}

/** Retrouve le libellé canonique dans la liste (casse officielle). */
export function canonicalResponsible(
  name: string,
  allowed: string[],
): string | null {
  const n = normalizeResponsibleName(name);
  return (
    allowed.find(
      (a) => a.localeCompare(n, "fr", { sensitivity: "base" }) === 0,
    ) ?? null
  );
}
