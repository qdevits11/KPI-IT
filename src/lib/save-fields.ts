import type { WeeklyRow } from "./types";

export type SaveFieldKey =
  | "demandesItHebdo"
  | "demandesClotureesHebdo"
  | "demandesNonResoluesHebdo"
  | "ticketsHorsSlaCloture"
  | "ticketsHorsSlaPriseEnCharge"
  | "ticketsByType"
  | "ticketsByAssignee"
  | "ticketsByRequester"
  /** @deprecated utiliser ticketsByType + ticketsByAssignee */
  | "ticketsBreakdown";

export type SaveFields = Partial<Record<SaveFieldKey, boolean>>;

export const DEFAULT_SAVE_FIELDS: SaveFields = {
  demandesItHebdo: true,
  demandesClotureesHebdo: true,
  demandesNonResoluesHebdo: false,
  ticketsHorsSlaCloture: true,
  ticketsHorsSlaPriseEnCharge: true,
  ticketsByType: true,
  ticketsByAssignee: true,
  /** Opt-in : éviter d’écraser les demandeurs si la clé est omise. */
  ticketsByRequester: false,
};

/** Résout les flags ventilations (gère l’ancien ticketsBreakdown). */
export function resolveBreakdownFlags(saveFields?: SaveFields | null): {
  type: boolean;
  assignee: boolean;
  requester: boolean;
} {
  const flags = { ...DEFAULT_SAVE_FIELDS, ...(saveFields ?? {}) };
  const legacy = flags.ticketsBreakdown;
  return {
    type: flags.ticketsByType ?? legacy ?? true,
    assignee: flags.ticketsByAssignee ?? legacy ?? true,
    requester: flags.ticketsByRequester ?? false,
  };
}

/** Ne garde que les champs KPI cochés pour l’écriture en base. */
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
    flags.demandesClotureesHebdo &&
    full.demandesClotureesHebdo !== undefined
  ) {
    patch.demandesClotureesHebdo = full.demandesClotureesHebdo;
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

/** Remet à null les KPI cochés (effacement). */
export function pickClearKpiPatch(
  saveFields?: SaveFields | null,
): Partial<WeeklyRow> {
  const flags = { ...DEFAULT_SAVE_FIELDS, ...(saveFields ?? {}) };
  const patch: Partial<WeeklyRow> = {
    jiraSyncedAt: new Date().toISOString(),
  };
  if (flags.demandesItHebdo) patch.demandesItHebdo = null;
  if (flags.demandesClotureesHebdo) patch.demandesClotureesHebdo = null;
  if (flags.demandesNonResoluesHebdo) {
    patch.demandesNonResoluesHebdo = null;
    patch.openFrozenAt = null;
  }
  if (flags.ticketsHorsSlaCloture) patch.ticketsHorsSlaCloture = null;
  if (flags.ticketsHorsSlaPriseEnCharge) {
    patch.ticketsHorsSlaPriseEnCharge = null;
  }
  return patch;
}

export function describeSaveFields(saveFields?: SaveFields | null): string[] {
  const flags = { ...DEFAULT_SAVE_FIELDS, ...(saveFields ?? {}) };
  const bd = resolveBreakdownFlags(flags);
  const labels: string[] = [];
  if (flags.demandesItHebdo) labels.push("tickets créés");
  if (flags.demandesClotureesHebdo) labels.push("tickets clôturés");
  if (flags.demandesNonResoluesHebdo) labels.push("non résolus");
  if (flags.ticketsHorsSlaCloture) labels.push("hors SLA clôture");
  if (flags.ticketsHorsSlaPriseEnCharge) {
    labels.push("hors SLA prise en charge");
  }
  if (bd.type) labels.push("types");
  if (bd.assignee) labels.push("assignés Jira");
  if (bd.requester) labels.push("demandeurs");
  return labels;
}

export function anySaveFieldSelected(saveFields?: SaveFields | null): boolean {
  const flags = { ...DEFAULT_SAVE_FIELDS, ...(saveFields ?? {}) };
  const bd = resolveBreakdownFlags(flags);
  return Boolean(
    flags.demandesItHebdo ||
      flags.demandesClotureesHebdo ||
      flags.demandesNonResoluesHebdo ||
      flags.ticketsHorsSlaCloture ||
      flags.ticketsHorsSlaPriseEnCharge ||
      bd.type ||
      bd.assignee ||
      bd.requester,
  );
}
