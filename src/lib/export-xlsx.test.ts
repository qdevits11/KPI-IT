import { describe, expect, it } from "vitest";
import {
  buildSheetData,
  ensureXlsxExtension,
  sanitizeFilename,
} from "./export-xlsx";

describe("sanitizeFilename", () => {
  it("remplace les caractères interdits", () => {
    expect(sanitizeFilename("Chiffres 2026 / SLA")).toBe("Chiffres_2026_SLA");
  });

  it("retire les accents pour un nom de fichier portable", () => {
    expect(sanitizeFilename("Statistiques tickets été")).toBe(
      "Statistiques_tickets_ete",
    );
  });

  it("fournit un fallback si tout est vidé", () => {
    expect(sanitizeFilename("???")).toBe("export");
  });
});

describe("ensureXlsxExtension", () => {
  it("ajoute .xlsx si absent", () => {
    expect(ensureXlsxExtension("rapport")).toBe("rapport.xlsx");
  });

  it("ne double pas l’extension", () => {
    expect(ensureXlsxExtension("rapport.XLSX")).toBe("rapport.XLSX");
  });
});

describe("buildSheetData", () => {
  it("produit une ligne d’en-tête gras + les valeurs", () => {
    const data = buildSheetData(
      [
        { header: "Nom", value: (r: { name: string }) => r.name, width: 20 },
        { header: "Total", value: (r: { total: number }) => r.total },
      ],
      [
        { name: "Alice", total: 3 },
        { name: "Bob", total: 0 },
      ],
    );

    expect(data).toHaveLength(3);
    expect(data[0]).toEqual([
      { value: "Nom", fontWeight: "bold" },
      { value: "Total", fontWeight: "bold" },
    ]);
    expect(data[1]).toEqual([{ value: "Alice" }, { value: 3 }]);
    expect(data[2]).toEqual([{ value: "Bob" }, { value: 0 }]);
  });

  it("mappe null / undefined / chaîne vide vers cellule vide", () => {
    const data = buildSheetData(
      [
        {
          header: "V",
          value: (r: { v: string | number | null | undefined }) => r.v,
        },
      ],
      [{ v: null }, { v: undefined }, { v: "" }, { v: 0 }],
    );
    expect(data[1]).toEqual([null]);
    expect(data[2]).toEqual([null]);
    expect(data[3]).toEqual([null]);
    expect(data[4]).toEqual([{ value: 0 }]);
  });

  it("exporte uniquement l’en-tête si aucune ligne", () => {
    const data = buildSheetData<{ id: number }>(
      [{ header: "Id", value: (r) => r.id }],
      [],
    );
    expect(data).toEqual([[{ value: "Id", fontWeight: "bold" }]]);
  });
});
