import { describe, expect, it } from "vitest";
import {
  discoverItCategoryField,
  isChannelLikeCategory,
  matchesKnownItCategory,
  resolveCategoryConnection,
} from "./jira-category-detect";

function extract(
  issue: { fields: Record<string, unknown> },
  fieldId: string,
): string | null {
  const raw = issue.fields[fieldId];
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    const v = (raw as { value: unknown }).value;
    return typeof v === "string" ? v : null;
  }
  if (typeof raw === "object" && raw !== null && "requestType" in raw) {
    const rt = (raw as { requestType?: { name?: string } }).requestType;
    return rt?.name ?? null;
  }
  return null;
}

describe("jira-category-detect", () => {
  it("reconnaît la taxonomie Coverseal et les canaux mail", () => {
    expect(matchesKnownItCategory("Elfsquad")).toBe(true);
    expect(matchesKnownItCategory("Demande de matériel")).toBe(true);
    expect(isChannelLikeCategory("Demandes envoyées par mail")).toBe(true);
    expect(isChannelLikeCategory("Odoo")).toBe(false);
  });

  it("détecte le customfield IT et ignore le Request Type mail", () => {
    const issues = [
      {
        fields: {
          customfield_10010: {
            requestType: { name: "Demandes envoyées par mail" },
          },
          customfield_10250: { value: "Elfsquad" },
        },
      },
      {
        fields: {
          customfield_10010: {
            requestType: { name: "Demandes envoyées par mail" },
          },
          customfield_10250: { value: "Odoo" },
        },
      },
      {
        fields: {
          customfield_10010: {
            requestType: { name: "Demandes envoyées par mail" },
          },
          customfield_10250: { value: "Demande de matériel" },
        },
      },
    ];

    const found = discoverItCategoryField(issues, extract, {
      customfield_10010: "Customer Request Type",
      customfield_10250: "Catégorie",
    });

    expect(found?.fieldId).toBe("customfield_10250");
    expect(found?.distinctValues).toEqual(
      expect.arrayContaining(["Elfsquad", "Odoo", "Demande de matériel"]),
    );

    const resolved = resolveCategoryConnection(
      { categoryField: "requestType", categoryCustomFieldId: "" },
      found,
    );
    expect(resolved).toEqual({
      categoryField: "custom",
      categoryCustomFieldId: "customfield_10250",
      usedDiscovery: true,
    });

    // Hint Coverseal 10152 prioritaire sur la détection
    expect(
      resolveCategoryConnection(
        {
          categoryField: "requestType",
          categoryCustomFieldId: "customfield_10152",
        },
        found,
      ),
    ).toEqual({
      categoryField: "custom",
      categoryCustomFieldId: "customfield_10152",
      usedDiscovery: false,
    });
  });
});

describe("normalizeCustomFieldId", () => {
  it("normalise 10152 → customfield_10152", async () => {
    const { normalizeCustomFieldId, DEFAULT_JIRA_SETTINGS } = await import(
      "./jira-auth"
    );
    expect(normalizeCustomFieldId("10152")).toBe("customfield_10152");
    expect(normalizeCustomFieldId("customfield_10152")).toBe(
      "customfield_10152",
    );
    expect(DEFAULT_JIRA_SETTINGS.categoryCustomFieldId).toBe(
      "customfield_10152",
    );
    expect(DEFAULT_JIRA_SETTINGS.categoryField).toBe("custom");
  });
});
