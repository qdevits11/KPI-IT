import { describe, expect, it } from "vitest";
import {
  isOpenSnapshotWindow,
  weekToFreezeOpenSnapshot,
  isIsoWeekCompleted,
  listCompletedWeeksToBackfill,
} from "./open-snapshot";
import { brusselsWallToUtc } from "./business-hours";

/** Couverture UTC → Bruxelles des deux crons Vercel (CET / CEST). */
function brusselsLabel(isoUtc: string): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return fmt.format(new Date(isoUtc));
}

describe("open snapshot window", () => {
  it("détecte dimanche 23:55 Bruxelles", () => {
    // 2026-08-02 = dimanche ; 23:55 CEST = 21:55 UTC
    const now = new Date("2026-08-02T21:55:00.000Z");
    expect(isOpenSnapshotWindow(now)).toBe(true);
    const target = weekToFreezeOpenSnapshot(now);
    expect(target).not.toBeNull();
    expect(target!.week).toBe(31);
    expect(target!.year).toBe(2026);
  });

  it("détecte rattrapage lundi 00:05 Bruxelles", () => {
    // 2026-08-03 lundi 00:05 CEST = 2026-08-02 22:05 UTC
    const now = new Date("2026-08-02T22:05:00.000Z");
    expect(isOpenSnapshotWindow(now)).toBe(true);
    const target = weekToFreezeOpenSnapshot(now);
    expect(target).not.toBeNull();
    expect(target!.week).toBe(31);
  });

  it("ignore un mardi après-midi", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    expect(isOpenSnapshotWindow(now)).toBe(false);
    expect(weekToFreezeOpenSnapshot(now)).toBeNull();
  });
});

describe("isIsoWeekCompleted", () => {
  it("S31 2026 est terminée après le lundi 3 août 00:00 Bruxelles", () => {
    const before = brusselsWallToUtc(2026, 8, 2, 23, 59, 0);
    const after = brusselsWallToUtc(2026, 8, 3, 0, 0, 1);
    expect(isIsoWeekCompleted(2026, 31, before)).toBe(false);
    expect(isIsoWeekCompleted(2026, 31, after)).toBe(true);
  });
});

describe("listCompletedWeeksToBackfill", () => {
  it("renvoie les semaines ISO précédentes complétées", () => {
    // Mercredi 5 août 2026 → semaine courante S32, précédente S31
    const now = new Date("2026-08-05T12:00:00.000Z");
    const list = listCompletedWeeksToBackfill(3, now);
    expect(list).toEqual([
      { year: 2026, week: 31 },
      { year: 2026, week: 30 },
      { year: 2026, week: 29 },
    ]);
  });
});

describe("vercel cron UTC ↔ fenêtre Bruxelles", () => {
  it("21:55 UTC dimanche tombe dans la fenêtre en CEST", () => {
    // 2026-08-02 dimanche CEST
    const now = new Date("2026-08-02T21:55:00.000Z");
    expect(brusselsLabel("2026-08-02T21:55:00.000Z")).toContain("23:55");
    expect(isOpenSnapshotWindow(now)).toBe(true);
    expect(weekToFreezeOpenSnapshot(now)?.week).toBe(31);
  });

  it("22:55 UTC dimanche tombe dans la fenêtre en CET", () => {
    // 2026-01-04 dimanche CET
    const now = new Date("2026-01-04T22:55:00.000Z");
    expect(isOpenSnapshotWindow(now)).toBe(true);
    expect(weekToFreezeOpenSnapshot(now)).not.toBeNull();
  });

  it("22:55 UTC dimanche est hors fenêtre live en CEST (filet heal)", () => {
    const now = new Date("2026-08-02T22:55:00.000Z");
    expect(isOpenSnapshotWindow(now)).toBe(false);
    expect(weekToFreezeOpenSnapshot(now)).toBeNull();
  });
});
