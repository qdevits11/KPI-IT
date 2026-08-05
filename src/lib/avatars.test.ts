import { describe, expect, it } from "vitest";
import {
  initialsFromName,
  mergePeopleDirectory,
  personEntryFromJiraUser,
  pickAvatarUrl,
} from "./avatars";

describe("avatars", () => {
  it("pickAvatarUrl privilégie 48x48", () => {
    expect(
      pickAvatarUrl({
        "16x16": "a",
        "48x48": "big",
        "24x24": "b",
      }),
    ).toBe("big");
  });

  it("personEntryFromJiraUser ignore Non assigné", () => {
    expect(
      personEntryFromJiraUser({
        displayName: "Non assigné",
        avatarUrls: { "48x48": "x" },
      }),
    ).toBeNull();
  });

  it("mergePeopleDirectory conserve l’avatar", () => {
    const merged = mergePeopleDirectory(
      { Alice: { displayName: "Alice", updatedAt: "1" } },
      [
        {
          displayName: "Alice",
          avatarUrl: "https://example/a.png",
          accountId: "1",
          updatedAt: "2",
        },
      ],
    );
    expect(merged.Alice.avatarUrl).toBe("https://example/a.png");
    expect(merged.Alice.accountId).toBe("1");
  });

  it("initialsFromName", () => {
    expect(initialsFromName("Gary Schreurs")).toBe("GS");
    expect(initialsFromName("Quentin")).toBe("QU");
  });
});
