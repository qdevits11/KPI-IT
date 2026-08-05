import { describe, expect, it } from "vitest";
import {
  atlassianOAuthConfigured,
  buildAtlassianAuthorizeUrl,
  JIRA_OAUTH_SCOPES,
} from "./jira-oauth";

describe("jira-oauth helpers", () => {
  it("détecte l’absence de config OAuth", () => {
    expect(atlassianOAuthConfigured()).toBe(false);
  });

  it("construit l’URL d’autorisation avec les bons scopes", () => {
    process.env.ATLASSIAN_CLIENT_ID = "client-test";
    process.env.ATLASSIAN_CLIENT_SECRET = "secret-test";
    const url = buildAtlassianAuthorizeUrl({
      state: "abc",
      redirectUri: "https://app.example/api/jira/oauth/callback",
    });
    expect(url).toContain("https://auth.atlassian.com/authorize?");
    expect(url).toContain("client_id=client-test");
    expect(url).toContain("state=abc");
    expect(url).toContain(encodeURIComponent("write:jira-work"));
    expect(JIRA_OAUTH_SCOPES).toContain("offline_access");
    delete process.env.ATLASSIAN_CLIENT_ID;
    delete process.env.ATLASSIAN_CLIENT_SECRET;
  });
});
