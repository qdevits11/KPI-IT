import { describe, expect, it } from "vitest";
import {
  clampWeekIdToCurrent,
  formatFrDate,
  formatWeekRangeLabel,
  isFutureWeekId,
  isoWeekPartsFromDate,
  mondayOfIsoWeek,
  sundayOfIsoWeek,
  weekIdFromDate,
} from "./dates";

describe("dates → semaine ISO", () => {
  it("mappe une date de juillet 2026 vers S31", () => {
    expect(isoWeekPartsFromDate("2026-07-27")).toEqual({
      year: 2026,
      week: 31,
      month: 7,
    });
    expect(weekIdFromDate("2026-07-27")).toBe("2026-S31");
  });

  it("gère le chevauchement d'année ISO", () => {
    // 29 déc 2025 tombe en semaine ISO 1 de 2026
    const parts = isoWeekPartsFromDate("2025-12-29");
    expect(parts.year).toBe(2026);
    expect(parts.week).toBe(1);
    expect(parts.month).toBe(12);
  });

  it("retrouve le lundi d'une semaine ISO", () => {
    expect(mondayOfIsoWeek(2026, 31)).toBe("2026-07-27");
    expect(weekIdFromDate(mondayOfIsoWeek(2026, 19))).toBe("2026-S19");
  });

  it("formate en fr-BE", () => {
    expect(formatFrDate("2026-07-27")).toBe("27/07/2026");
  });

  it("donne le dimanche et le libellé de plage", () => {
    expect(sundayOfIsoWeek(2026, 31)).toBe("2026-08-02");
    expect(formatWeekRangeLabel(2026, 31)).toBe("27 juillet – 2 août 2026");
    expect(formatWeekRangeLabel(2026, 32)).toBe("3 – 9 août 2026");
  });

  it("détecte et borne les semaines futures", () => {
    const now = new Date("2026-08-07T12:00:00Z"); // S32
    expect(isFutureWeekId("2026-S32", now)).toBe(false);
    expect(isFutureWeekId("2026-S33", now)).toBe(true);
    expect(isFutureWeekId("2025-S52", now)).toBe(false);
    expect(clampWeekIdToCurrent("2026-S40", now)).toBe("2026-S32");
    expect(clampWeekIdToCurrent("2026-S31", now)).toBe("2026-S31");
    expect(clampWeekIdToCurrent("nope", now)).toBe("2026-S32");
  });
});
