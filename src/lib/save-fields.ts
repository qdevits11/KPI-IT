import type { WeeklyRow } from "./types";

export type SaveFieldKey =
  | "demandesItHebdo"
  | "demandesNonResoluesHebdo"
  | "ticketsHorsSlaCloture"
  | "ticketsHorsSlaPriseEnCharge"
  | "ticketsBreakdown";

export type SaveFields = Partial<Record<SaveFieldKey, boolean>>;

export const DEFAULT_SAVE_FIELDS: SaveFields = {
  demandesItHebdo: true,
  demandesNonResoluesHebdo: false,
  ticketsHorsSlaCloture: true,
  ticketsHorsSlaPriseEnCharge: true,
  ticketsBreakdown: true,
};

/** Ne garde que les champs cochés pour l’écriture en base. */
export function pickSavePatch(
  full: Partial<WeeklyRow>,
  saveFields?: SaveFields | null,
): Partial<WeeklyRow> {
  const flags = { ...DEFAULT_SAVE_FIELDS, ...(saveFields ?? {}) };
  const patch: Partial<WeeklyRow> = {
    jiraSyncedAt: full.jiraSyncedAt ?? new Date().toISOString(),
  };

  if (flags.demandesItHebdo && full.demandesItHebdo !== undefined) {
    patch.demandesItHebdo = full.demandesItHebdo;
  }
  if (
    flags.demandesNonResoluesHebdo &&
    full.demandesNonResoluesHebdo !== undefined
  ) {
    patch.demandesNonResoluesHebdo = full.demandesNonResoluesHebdo;
    if (full.openFrozenAt !== undefined) {
      patch.openFrozenAt = full.openFrozenAt;
    }
  }
  if (
    flags.ticketsHorsSlaCloture &&
    full.ticketsHorsSlaCloture !== undefined
  ) {
    patch.ticketsHorsSlaCloture = full.ticketsHorsSlaCloture;
  }
  if (
    flags.ticketsHorsSlaPriseEnCharge &&
    full.ticketsHorsSlaPriseEnCharge !== undefined
  ) {
    patch.ticketsHorsSlaPriseEnCharge = full.ticketsHorsSlaPriseEnCharge;
  }

  return patch;
}

export function describeSaveFields(saveFields?: SaveFields | null): string[] {
  const flags = { ...DEFAULT_SAVE_FIELDS, ...(saveFields ?? {}) };
  const labels: Array<[SaveFieldKey, string]> = [
    ["demandesItHebdo", "tickets créés"],
    ["demandesNonResoluesHebdo", "non résolus"],
    ["ticketsHorsSlaCloture", "hors SLA clôture"],
    ["ticketsHorsSlaPriseEnCharge", "hors SLA prise en charge"],
    ["ticketsBreakdown", "répartition type/assigné"],
  ];
  return labels.filter(([k]) => flags[k]).map(([, label]) => label);
}
