/** Export client-side de tableaux vers Excel (.xlsx). */

import type { SheetData as LibSheetData } from "write-excel-file/browser";

export type ExportCellValue = string | number | boolean | Date | null | undefined;

export type ExportColumnDef<T> = {
  header: string;
  value: (row: T) => ExportCellValue;
  /** Largeur approximative en caractères. */
  width?: number;
};

export type SheetCell =
  | string
  | number
  | boolean
  | Date
  | null
  | {
      value: string | number | boolean | Date;
      fontWeight?: "bold";
    };

export type SheetRow = SheetCell[];
export type SheetData = SheetRow[];

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
  return cleaned || "export";
}

export function ensureXlsxExtension(filename: string): string {
  const base = sanitizeFilename(filename);
  return /\.xlsx$/i.test(base) ? base : `${base}.xlsx`;
}

function toSheetCell(value: ExportCellValue): SheetCell {
  if (value === null || value === undefined || value === "") return null;
  return { value };
}

/** Construit les lignes Excel (en-tête + données) — pure, testable. */
export function buildSheetData<T>(
  columns: ExportColumnDef<T>[],
  rows: T[],
): SheetData {
  const header: SheetRow = columns.map((c) => ({
    value: c.header,
    fontWeight: "bold",
  }));
  const body = rows.map((row) => columns.map((c) => toSheetCell(c.value(row))));
  return [header, ...body];
}

export function columnWidthsFromDefs<T>(
  columns: ExportColumnDef<T>[],
): Array<{ width?: number }> {
  return columns.map((c) => (c.width != null ? { width: c.width } : {}));
}

async function writeAndDownload(
  data: SheetData,
  filename: string,
  sheetName: string,
  columns?: Array<{ width?: number }>,
): Promise<void> {
  const writeExcelFile = (await import("write-excel-file/browser")).default;
  await writeExcelFile(data as LibSheetData, {
    sheet: sheetName.slice(0, 31) || "Export",
    columns,
  }).toFile(ensureXlsxExtension(filename));
}

/** Télécharge un fichier .xlsx à partir de colonnes typées + lignes objets. */
export async function downloadXlsx<T>(options: {
  filename: string;
  sheetName?: string;
  columns: ExportColumnDef<T>[];
  rows: T[];
}): Promise<void> {
  const data = buildSheetData(options.columns, options.rows);
  await writeAndDownload(
    data,
    options.filename,
    options.sheetName ?? "Export",
    columnWidthsFromDefs(options.columns),
  );
}

/** Télécharge un fichier .xlsx à partir d’une grille déjà construite. */
export async function downloadXlsxSheet(options: {
  filename: string;
  sheetName?: string;
  data: SheetData;
  columnWidths?: number[];
}): Promise<void> {
  const columns = options.columnWidths?.map((width) => ({ width }));
  await writeAndDownload(
    options.data,
    options.filename,
    options.sheetName ?? "Export",
    columns,
  );
}
