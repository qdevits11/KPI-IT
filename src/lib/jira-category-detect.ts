/**
 * Détection du champ Jira qui porte les catégories IT Coverseal
 * (Elfsquad, Odoo, Demande de matériel…), distinct du Request Type JSM
 * de canal (« Demandes envoyées par mail »).
 */

import type { JiraConnection } from "./jira-auth";

/** Taxonomie issue de l’historique Excel KPI — sert de signature de détection. */
export const COVERSEAL_IT_CATEGORIES = [
  "Automatisation",
  "Becovis",
  "Demande de matériel",
  "Documentation à faire",
  "Elfsquad",
  "Exact",
  "Extract",
  "Google",
  "Imprimante",
  "Keeper",
  "NAS",
  "Non catégorisé",
  "Odoo",
  "Outlook",
  "Partenaire",
  "Problème matériel",
  "Réseau",
  "Salle de réunion",
  "SolidWorks",
  "Teams",
  "Téléphonie",
  "VPlan",
  "Website",
  "Site internet",
  "mini-ERP",
] as const;

const KNOWN_LOWER = new Set(
  COVERSEAL_IT_CATEGORIES.map((c) => c.toLowerCase()),
);

/** Request types de canal / génériques à ne pas confondre avec les catégories IT. */
const CHANNEL_REQUEST_TYPES = [
  "demandes envoyées par mail",
  "demande envoyée par mail",
  "email request",
  "e-mail",
  "mail",
  "email",
  "portal request",
  "demande via le portail",
  "get it help",
  "[system] service request",
  "service request",
];

export function isChannelLikeCategory(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  return CHANNEL_REQUEST_TYPES.some(
    (c) => n === c || n.includes(c) || c.includes(n),
  );
}

export function matchesKnownItCategory(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (KNOWN_LOWER.has(n)) return true;
  // Approche souple : « Site internet » ≈ Website, etc.
  for (const known of KNOWN_LOWER) {
    if (n.includes(known) || known.includes(n)) return true;
  }
  return false;
}

export function fieldNameLooksLikeItCategory(name: string): boolean {
  const n = name.trim().toLowerCase();
  return /cat[eé]gor|classification|nature|type de demande|demande it|sous[- ]?type|topic|th[eè]me/.test(
    n,
  );
}

export type CategoryValueExtractor = (
  issue: { fields: Record<string, unknown> },
  fieldId: string,
) => string | null;

export interface DiscoveredCategoryField {
  fieldId: string;
  fieldName?: string;
  hitCount: number;
  distinctValues: string[];
  nameScore: number;
}

/**
 * Parcourt les customfields des issues et score ceux dont les valeurs
 * collent à la taxonomie Excel (Elfsquad, Odoo…).
 * Ignore les objets « Customer Request Type » JSM.
 */
export function discoverItCategoryField(
  issues: Array<{ fields: Record<string, unknown> }>,
  extractValue: CategoryValueExtractor,
  fieldNames?: Record<string, string>,
): DiscoveredCategoryField | null {
  const stats = new Map<
    string,
    { hits: number; values: Map<string, number>; isRequestType: boolean }
  >();

  for (const issue of issues) {
    for (const [key, raw] of Object.entries(issue.fields)) {
      if (!key.startsWith("customfield_")) continue;
      if (raw == null || raw === "") continue;

      const asObj =
        raw !== null && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : null;
      const isRequestType = Boolean(
        asObj && asObj.requestType && typeof asObj.requestType === "object",
      );

      const value = extractValue(issue, key);
      if (!value) continue;

      let entry = stats.get(key);
      if (!entry) {
        entry = { hits: 0, values: new Map(), isRequestType };
        stats.set(key, entry);
      }
      entry.isRequestType = entry.isRequestType || isRequestType;
      entry.values.set(value, (entry.values.get(value) ?? 0) + 1);
      if (matchesKnownItCategory(value)) entry.hits += 1;
    }
  }

  let best: DiscoveredCategoryField | null = null;

  for (const [fieldId, entry] of stats) {
    // Le Request Type JSM de canal ne doit pas gagner même s’il matche un mot
    if (entry.isRequestType) continue;

    const distinctValues = [...entry.values.keys()].sort(
      (a, b) => (entry.values.get(b) ?? 0) - (entry.values.get(a) ?? 0),
    );
    const knownDistinct = distinctValues.filter(matchesKnownItCategory).length;
    const channelHeavy =
      distinctValues.length > 0 &&
      distinctValues.filter(isChannelLikeCategory).length >=
        Math.ceil(distinctValues.length * 0.6);

    const fieldName = fieldNames?.[fieldId];
    const nameScore = fieldName && fieldNameLooksLikeItCategory(fieldName) ? 5 : 0;

    // Score : hits taxonomie + diversité connue + bonus nom de champ
    const score =
      entry.hits * 3 +
      knownDistinct * 4 +
      nameScore +
      (channelHeavy ? -20 : 0) +
      Math.min(distinctValues.length, 8);

    if (entry.hits === 0 && nameScore === 0 && knownDistinct === 0) continue;

    const candidate: DiscoveredCategoryField = {
      fieldId,
      fieldName,
      hitCount: entry.hits,
      distinctValues: distinctValues.slice(0, 12),
      nameScore,
    };

    const bestScore = best
      ? best.hitCount * 3 +
        best.distinctValues.filter(matchesKnownItCategory).length * 4 +
        best.nameScore +
        Math.min(best.distinctValues.length, 8)
      : -1;

    if (!best || score > bestScore) best = candidate;
  }

  // Champ nommé « Catégorie » même sans hit Excel encore (nouvelles valeurs)
  if (!best && fieldNames) {
    for (const [id, name] of Object.entries(fieldNames)) {
      if (!id.startsWith("customfield_")) continue;
      if (!fieldNameLooksLikeItCategory(name)) continue;
      const entry = stats.get(id);
      if (!entry || entry.isRequestType) continue;
      return {
        fieldId: id,
        fieldName: name,
        hitCount: entry.hits,
        distinctValues: [...entry.values.keys()].slice(0, 12),
        nameScore: 5,
      };
    }
  }

  return best;
}

export function resolveCategoryConnection(
  connection: Pick<JiraConnection, "categoryField" | "categoryCustomFieldId">,
  discovered: DiscoveredCategoryField | null,
): {
  categoryField: JiraConnection["categoryField"];
  categoryCustomFieldId: string;
  usedDiscovery: boolean;
} {
  // Champ custom explicite toujours prioritaire
  if (
    connection.categoryField === "custom" &&
    connection.categoryCustomFieldId
  ) {
    return {
      categoryField: "custom",
      categoryCustomFieldId: connection.categoryCustomFieldId,
      usedDiscovery: false,
    };
  }

  const wantAuto =
    connection.categoryField === "auto" ||
    connection.categoryField === "requestType" ||
    connection.categoryField === "component";

  if (wantAuto && discovered) {
    return {
      categoryField: "custom",
      categoryCustomFieldId: discovered.fieldId,
      usedDiscovery: true,
    };
  }

  return {
    categoryField: connection.categoryField,
    categoryCustomFieldId: connection.categoryCustomFieldId,
    usedDiscovery: false,
  };
}

/** Liste courte des customfields candidats (debug sync). */
export function listCategoryFieldCandidates(
  issues: Array<{ fields: Record<string, unknown> }>,
  extractValue: CategoryValueExtractor,
  fieldNames?: Record<string, string>,
  limit = 5,
): string[] {
  const stats = new Map<string, Set<string>>();
  for (const issue of issues) {
    for (const [key, raw] of Object.entries(issue.fields)) {
      if (!key.startsWith("customfield_")) continue;
      const asObj =
        raw !== null && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : null;
      if (asObj?.requestType) continue;
      const value = extractValue(issue, key);
      if (!value) continue;
      let set = stats.get(key);
      if (!set) {
        set = new Set();
        stats.set(key, set);
      }
      set.add(value);
    }
  }
  return [...stats.entries()]
    .map(([id, values]) => {
      const name = fieldNames?.[id];
      const vals = [...values].slice(0, 4).join("|");
      return `${id}${name ? `(${name})` : ""}=${vals}`;
    })
    .sort((a, b) => b.length - a.length)
    .slice(0, limit);
}
