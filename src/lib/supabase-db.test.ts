import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "./types";

const { fromMock, createClientMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  const createClientMock = vi.fn(() => ({ from: fromMock }));
  return { fromMock, createClientMock };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) =>
    createClientMock(...(args as [string, string])),
}));

import {
  loadDbFromSupabase,
  resetSupabaseClientForTests,
  saveDbToSupabase,
  supabaseConfigured,
} from "./supabase-db";

function sampleDb(): AppDatabase {
  return {
    year: 2026,
    weeks: [],
    automationsMetier: [],
    automationsOdoo: [],
    maintenances: [],
    phishing: [],
    ticketsByType: {},
    ticketsByAssignee: {},
    ticketsByRequester: { "2026-S31": { Alice: 2 } },
    settings: {
      companyName: "Test",
      jiraConfigured: false,
      responsibles: ["A"],
      accessUsers: [],
    },
  };
}

describe("supabase-db", () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    resetSupabaseClientForTests();
    fromMock.mockReset();
    createClientMock.mockClear();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  });

  afterEach(() => {
    resetSupabaseClientForTests();
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  });

  it("détecte la config", () => {
    expect(supabaseConfigured()).toBe(true);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetSupabaseClientForTests();
    expect(supabaseConfigured()).toBe(false);
  });

  it("charge le document", async () => {
    const db = sampleDb();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { data: db }, error: null }),
        }),
      }),
    });
    const loaded = await loadDbFromSupabase();
    expect(loaded?.ticketsByRequester["2026-S31"]).toEqual({ Alice: 2 });
  });

  it("upsert le document", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({ upsert });
    const ok = await saveDbToSupabase(sampleDb());
    expect(ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default" }),
      { onConflict: "id" },
    );
  });

  it("rapporte le statut Supabase ok", async () => {
    const { getStorageStatus } = await import("./supabase-db");
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              data: sampleDb(),
              updated_at: "2026-08-05T12:00:00.000Z",
            },
            error: null,
          }),
        }),
      }),
    });
    const status = await getStorageStatus();
    expect(status).toMatchObject({
      backend: "supabase",
      ok: true,
      requesterWeeks: 1,
    });
  });
});
