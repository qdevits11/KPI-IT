import { describe, expect, it } from "vitest";
import {
  decryptConnection,
  encryptConnection,
  normalizeCustomFieldId,
  type JiraConnection,
} from "./jira-auth";
import { DEFAULT_JIRA_SETTINGS } from "./jira-auth";

function sampleConn(overrides: Partial<JiraConnection> = {}): JiraConnection {
  return {
    baseUrl: "https://coverseal.atlassian.net",
    email: "it@coverseal.com",
    apiToken: "secret-token-xyz",
    ...DEFAULT_JIRA_SETTINGS,
    connectedAt: "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("jira-auth encrypt/decrypt", () => {
  it("round-trip conserve email + token", () => {
    const conn = sampleConn();
    const cipher = encryptConnection(conn);
    expect(cipher).not.toContain("secret-token");
    const back = decryptConnection(cipher);
    expect(back?.email).toBe("it@coverseal.com");
    expect(back?.apiToken).toBe("secret-token-xyz");
    expect(back?.baseUrl).toBe("https://coverseal.atlassian.net");
  });

  it("rejette un cipher corrompu", () => {
    expect(decryptConnection("pas-un-cipher")).toBeNull();
  });

  it("normalise customfield id", () => {
    expect(normalizeCustomFieldId("10152")).toBe("customfield_10152");
    expect(normalizeCustomFieldId("customfield_10152")).toBe(
      "customfield_10152",
    );
  });
});
