import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "./types";

const { putMock, getMock, headMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  getMock: vi.fn(),
  headMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...(args as [string, string, object])),
  get: (...args: unknown[]) => getMock(...(args as [string, object])),
  head: (...args: unknown[]) => headMock(...(args as [string])),
}));

import {
  blobConfigured,
  loadDbFromBlob,
  saveDbToBlob,
  saveDbToBlobIfAbsent,
} from "./db-persist";

function sampleDb(requesters: Record<string, Record<string, number>>): AppDatabase {
  return {
    year: 2026,
    weeks: [],
    automationsMetier: [],
    automationsOdoo: [],
    maintenances: [],
    phishing: [],
    ticketsByType: {},
    ticketsByAssignee: {},
    ticketsByRequester: requesters,
    schemaVersion: 2,
    revision: 1,
    settings: {
      responsibles: ["A"],
      accessUsers: [],
      peopleDirectory: {},
    },
  };
}

describe("db-persist", () => {
  const prevToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    putMock.mockReset();
    getMock.mockReset();
    headMock.mockReset();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });

  afterEach(() => {
    if (prevToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevToken;
  });

  it("détecte la config Blob", () => {
    expect(blobConfigured()).toBe(true);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(blobConfigured()).toBe(false);
  });

  it("lit une base depuis le Blob", async () => {
    const db = sampleDb({ "2026-S01": { Alice: 1 } });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(db)));
        controller.close();
      },
    });
    getMock.mockResolvedValue({ statusCode: 200, stream });

    const loaded = await loadDbFromBlob();
    expect(loaded?.ticketsByRequester["2026-S01"]).toEqual({ Alice: 1 });
  });

  it("n’écrase pas un Blob existant au seed", async () => {
    headMock.mockResolvedValue({ pathname: "kpi-it/db.json", size: 10 });
    const ok = await saveDbToBlobIfAbsent(sampleDb({}));
    expect(ok).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("écrit le Blob s’il est absent", async () => {
    headMock.mockRejectedValue(new Error("not found"));
    putMock.mockResolvedValue({ url: "https://blob/x" });
    const ok = await saveDbToBlobIfAbsent(sampleDb({ "2026-S02": { B: 2 } }));
    expect(ok).toBe(true);
    expect(putMock).toHaveBeenCalledOnce();
  });

  it("autorise l’overwrite sur sync normal", async () => {
    putMock.mockResolvedValue({ url: "https://blob/x" });
    const ok = await saveDbToBlob(sampleDb({ "2026-S03": { C: 3 } }));
    expect(ok).toBe(true);
    expect(putMock).toHaveBeenCalledWith(
      "kpi-it/db.json",
      expect.any(String),
      expect.objectContaining({ allowOverwrite: true, access: "private" }),
    );
  });
});
