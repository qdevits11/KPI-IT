import { describe, expect, it } from "vitest";
import {
  formatFrDate,
  isoWeekPartsFromDate,
  mondayOfIsoWeek,
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
});
