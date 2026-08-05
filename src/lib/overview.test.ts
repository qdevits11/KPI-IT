import { describe, expect, it } from "vitest";
import { buildYearOverview } from "./formulas";
import { seedDatabase } from "./seed";

describe("vue annuelle", () => {
  const db = seedDatabase();

  it("produit 52 lignes pour 2026", () => {
    const rows = buildYearOverview(db, 2026);
    expect(rows.length).toBe(52);
    expect(rows[0].week).toBe(1);
    expect(rows[30].weekKey).toBe("2026-S31");
  });

  it("aligne YTD demandes S31 = 1090", () => {
    const row = buildYearOverview(db, 2026).find((r) => r.week === 31)!;
    expect(row.demandesItHebdo).toBe(15);
    expect(row.demandesItYtd).toBe(1090);
    expect(row.automationsMetier).toBe(1);
  });

  it("expose les remarques Excel", () => {
    const row = buildYearOverview(db, 2026).find((r) => r.week === 31)!;
    expect(row.fluctuation).toContain("formation Bandi");
  });
});
