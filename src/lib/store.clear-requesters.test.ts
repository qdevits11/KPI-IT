import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearTicketsByRequester,
  getDatabase,
  setTicketsByRequester,
} from "./store";

describe("clearTicketsByRequester", () => {
  let dir: string;
  const prev = process.env.KPI_DB_DIR;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "kpi-clear-"));
    process.env.KPI_DB_DIR = dir;
    await setTicketsByRequester("2026-S02", { Alice: 1 });
    await setTicketsByRequester("2026-S31", { Bob: 2 });
    await setTicketsByRequester("2025-S10", { Carol: 3 });
  });

  afterEach(() => {
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
