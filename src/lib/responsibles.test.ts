import { describe, expect, it } from "vitest";
import {
  canonicalResponsible,
  DEFAULT_RESPONSIBLES,
  isAllowedResponsible,
  normalizeResponsibleName,
  sortResponsibles,
} from "./responsibles";

describe("responsibles", () => {
  it("defaults = Gary, Quentin, Loic, Dominique", () => {
    expect([...DEFAULT_RESPONSIBLES].sort()).toEqual(
      ["Dominique", "Gary", "Loic", "Quentin"].sort(),
    );
  });

  it("accepte la casse proche", () => {
    const list = [...DEFAULT_RESPONSIBLES];
    expect(isAllowedResponsible("gary", list)).toBe(true);
    expect(canonicalResponsible("LOIC", list)).toBe("Loic");
    expect(isAllowedResponsible("Alice", list)).toBe(false);
  });

  it("normalise et trie", () => {
    expect(normalizeResponsibleName("  Gary  ")).toBe("Gary");
    expect(sortResponsibles(["Quentin", "Dominique", "Gary"])).toEqual([
      "Dominique",
      "Gary",
      "Quentin",
    ]);
  });
});
