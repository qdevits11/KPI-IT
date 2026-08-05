import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearTicketsByRequester,
  getDatabase,
  patchTicketsBreakdown,
  resetDbCacheForTests,
  setTicketsByRequester,
} from "./store";

describe("clearTicketsByRequester", () => {
  let dir: string;
  const prev = process.env.KPI_DB_DIR;

  beforeEach(async () => {
    resetDbCacheForTests();
    dir = mkdtempSync(join(tmpdir(), "kpi-clear-"));
    process.env.KPI_DB_DIR = dir;
    await setTicketsByRequester("2026-S02", { Alice: 1 });
    await setTicketsByRequester("2026-S31", { Bob: 2 });
    await setTicketsByRequester("2025-S10", { Carol: 3 });
  });

  afterEach(() => {
    resetDbCacheForTests();
    if (prev === undefined) delete process.env.KPI_DB_DIR;
    else process.env.KPI_DB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it("efface une plage d’années/semaines", async () => {
    const result = await clearTicketsByRequester({
      year: 2026,
      weekFrom: 2,
      weekTo: 31,
    });
    expect(result.removed).toBe(2);
    const db = await getDatabase();
    expect(Object.keys(db.ticketsByRequester)).toEqual(["2025-S10"]);
  });

  it("efface toute une année", async () => {
    const result = await clearTicketsByRequester({ year: 2025 });
    expect(result.removed).toBe(1);
    const db = await getDatabase();
    expect(Object.keys(db.ticketsByRequester).sort()).toEqual([
      "2026-S02",
      "2026-S31",
    ]);
  });
});

describe("patchTicketsBreakdown assignee-only", () => {
  let dir: string;
  const prev = process.env.KPI_DB_DIR;

  beforeEach(async () => {
    resetDbCacheForTests();
    dir = mkdtempSync(join(tmpdir(), "kpi-patch-"));
    process.env.KPI_DB_DIR = dir;
    await setTicketsByRequester("2026-S01", { Alice: 5 });
    await setTicketsByRequester("2026-S31", { Bob: 8 });
    await patchTicketsBreakdown("2026-S10", {
      byAssignee: { Jean: 3 },
      byType: { Bug: 2 },
    });
  });

  afterEach(() => {
    resetDbCacheForTests();
    if (prev === undefined) delete process.env.KPI_DB_DIR;
    else process.env.KPI_DB_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it("ne touche pas aux demandeurs de l’année", async () => {
    await patchTicketsBreakdown("2026-S31", {
      byAssignee: { Marie: 4 },
    });

    const db = await getDatabase();
    expect(db.ticketsByRequester).toEqual({
      "2026-S01": { Alice: 5 },
      "2026-S31": { Bob: 8 },
    });
    expect(db.ticketsByAssignee["2026-S31"]).toEqual({ Marie: 4 });
    expect(db.ticketsByAssignee["2026-S10"]).toEqual({ Jean: 3 });
    expect(db.ticketsByType["2026-S10"]).toEqual({ Bug: 2 });
  });

  it("préserve les demandeurs après relecture disque (sans cache)", async () => {
    await patchTicketsBreakdown("2026-S31", {
      byAssignee: { Marie: 4 },
    });
    resetDbCacheForTests();

    const db = await getDatabase();
    expect(Object.keys(db.ticketsByRequester).sort()).toEqual([
      "2026-S01",
      "2026-S31",
    ]);
    expect(db.ticketsByRequester["2026-S31"]).toEqual({ Bob: 8 });
  });
});
