import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, SUPABASE_PAGE_SIZE } from "./relational";

describe("fetchAllRows", () => {
  it("enchaîne les pages jusqu’à épuisement (limite PostgREST 1000)", async () => {
    const page1 = Array.from({ length: SUPABASE_PAGE_SIZE }, (_, i) => ({
      id: i,
    }));
    const page2 = [{ id: SUPABASE_PAGE_SIZE }, { id: SUPABASE_PAGE_SIZE + 1 }];
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const rows = await fetchAllRows<{ id: number }>(() => ({ range }));

    expect(range).toHaveBeenCalledTimes(2);
    expect(range).toHaveBeenNthCalledWith(1, 0, SUPABASE_PAGE_SIZE - 1);
    expect(range).toHaveBeenNthCalledWith(
      2,
      SUPABASE_PAGE_SIZE,
      SUPABASE_PAGE_SIZE * 2 - 1,
    );
    expect(rows).toHaveLength(SUPABASE_PAGE_SIZE + 2);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows.at(-1)).toEqual({ id: SUPABASE_PAGE_SIZE + 1 });
  });

  it("s’arrête sur une première page incomplète", async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ id: 1 }],
      error: null,
    });
    const rows = await fetchAllRows<{ id: number }>(() => ({ range }));
    expect(range).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("remonte l’erreur PostgREST", async () => {
    const range = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(fetchAllRows(() => ({ range }))).rejects.toThrow("boom");
  });
});
