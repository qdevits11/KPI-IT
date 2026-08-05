import { describe, expect, it } from "vitest";
import {
  buildAppUser,
  canAccessAdminPages,
  canEditWeekRetour,
  defaultAccessUsers,
  encodingLabel,
  formatUserBadges,
  isAdmin,
  isEncodingResponsible,
  isKpiResponsible,
  normalizeAccessUsers,
} from "./roles";

describe("roles", () => {
  it("applique les flags indépendants (admin + KPI + encodage)", () => {
    const both = buildAppUser("q.devits@coverseal.com", "Quentin", {
      isAdmin: true,
      isKpiResponsible: true,
      isEncodingResponsible: true,
    });
    expect(both.isAdmin).toBe(true);
    expect(both.isKpiResponsible).toBe(true);
    expect(both.isEncodingResponsible).toBe(true);
    expect(canAccessAdminPages(both)).toBe(true);
    expect(canEditWeekRetour(both)).toBe(true);
    expect(isEncodingResponsible(both)).toBe(true);
    expect(formatUserBadges(both)).toBe("admin · KPI · encodage");
  });

  it("autorise responsable KPI sans être admin", () => {
    const kpi = buildAppUser("kpi@coverseal.com", undefined, {
      isKpiResponsible: true,
    });
    expect(isAdmin(kpi)).toBe(false);
    expect(isKpiResponsible(kpi)).toBe(true);
    expect(canAccessAdminPages(kpi)).toBe(false);
    expect(canEditWeekRetour(kpi)).toBe(true);
    expect(formatUserBadges(kpi)).toBe("KPI");
  });

  it("traite un email sans droits comme user", () => {
    const u = buildAppUser("colleague@coverseal.com", "Colleague");
    expect(u.isAdmin).toBe(false);
    expect(u.isKpiResponsible).toBe(false);
    expect(u.isEncodingResponsible).toBe(false);
    expect(canAccessAdminPages(u)).toBe(false);
    expect(canEditWeekRetour(u)).toBe(false);
    expect(formatUserBadges(u)).toBe("user");
  });

  it("refuse null", () => {
    expect(canAccessAdminPages(null)).toBe(false);
    expect(canEditWeekRetour(null)).toBe(false);
  });

  it("bootstrap defaultAccessUsers inclut l’admin Coverseal", () => {
    const users = defaultAccessUsers();
    const admin = users.find((u) => u.email === "q.devits@coverseal.com");
    expect(admin?.isAdmin).toBe(true);
    expect(admin?.isKpiResponsible).toBe(true);
    expect(admin?.isEncodingResponsible).toBe(true);
  });

  it("normalizeAccessUsers fusionne et conserve les connectés sans droits", () => {
    const normalized = normalizeAccessUsers([
      {
        email: "A@Coverseal.com",
        isAdmin: true,
        isKpiResponsible: false,
        isEncodingResponsible: false,
      },
      {
        email: "a@coverseal.com",
        isAdmin: false,
        isKpiResponsible: true,
        isEncodingResponsible: true,
        lastLoginAt: "2026-08-01T10:00:00.000Z",
      },
      {
        email: "colleague@coverseal.com",
        displayName: "Colleague",
        isAdmin: false,
        isKpiResponsible: false,
        isEncodingResponsible: false,
        lastLoginAt: "2026-08-05T12:00:00.000Z",
      },
    ]);
    expect(normalized).toHaveLength(2);
    const admin = normalized.find((u) => u.email === "a@coverseal.com")!;
    expect(admin.isAdmin).toBe(true);
    expect(admin.isKpiResponsible).toBe(true);
    expect(admin.isEncodingResponsible).toBe(true);
    const colleague = normalized.find(
      (u) => u.email === "colleague@coverseal.com",
    )!;
    expect(colleague.isAdmin).toBe(false);
    expect(colleague.lastLoginAt).toBe("2026-08-05T12:00:00.000Z");

    const fallback = normalizeAccessUsers([
      {
        email: "only@x.com",
        isAdmin: false,
        isKpiResponsible: true,
        isEncodingResponsible: false,
      },
    ]);
    expect(fallback.some((u) => u.isAdmin)).toBe(true);
    expect(fallback.some((u) => u.email === "only@x.com")).toBe(true);
  });

  it("encodingLabel préfère le displayName", () => {
    expect(
      encodingLabel({
        email: "q@coverseal.com",
        displayName: "Quentin",
        isAdmin: false,
        isKpiResponsible: false,
        isEncodingResponsible: true,
      }),
    ).toBe("Quentin");
    expect(
      encodingLabel({
        email: "gary@coverseal.com",
        isAdmin: false,
        isKpiResponsible: false,
        isEncodingResponsible: true,
      }),
    ).toBe("gary");
  });
});
