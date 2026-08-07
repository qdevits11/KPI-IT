import { describe, expect, it } from "vitest";
import { deltaToneClass, formatDelta } from "./format";

describe("formatDelta", () => {
  it("formate les écarts absolus", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(-3)).toBe("−3");
    expect(formatDelta(0)).toBe("=0");
    expect(formatDelta(null)).toBeNull();
  });
});

describe("deltaToneClass", () => {
  it("vert si évolution favorable", () => {
    expect(deltaToneClass(2, true)).toContain("--ok");
    expect(deltaToneClass(-2, false)).toContain("--ok");
  });

  it("rouge si évolution défavorable", () => {
    expect(deltaToneClass(2, false)).toContain("--crit");
    expect(deltaToneClass(-2, true)).toContain("--crit");
  });
});
