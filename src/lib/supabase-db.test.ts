import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  loadJiraCipherFromSupabase,
  resetSupabaseClientForTests,
  saveJiraCipherToSupabase,
  supabaseConfigured,
} from "./supabase-db";

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

  it("charge le cipher Jira", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { cipher: "abc.cipher" },
            error: null,
          }),
        }),
      }),
    });
    const cipher = await loadJiraCipherFromSupabase();
    expect(cipher).toBe("abc.cipher");
  });

  it("upsert le cipher Jira", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    fromMock.mockReturnValue({ upsert });
    const ok = await saveJiraCipherToSupabase("cipher-value");
    expect(ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default", cipher: "cipher-value" }),
      { onConflict: "id" },
    );
  });
});
