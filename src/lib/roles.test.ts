import { describe, expect, it } from "vitest";
import {
  buildAppUser,
  canAccessAdminPages,
  canEditWeekRetour,
  defaultAccessUsers,
  formatUserBadges,
  isAdmin,
  isKpiResponsible,
  normalizeAccessUsers,
} from "./roles";

describe("roles", () => {
  it("applique les flags indépendants (admin + KPI)", () => {
    const both = buildAppUser("q.devits@coverseal.com", "Quentin", {
      isAdmin: true,
      isKpiResponsible: true,
    });
    expect(both.isAdmin).toBe(true);
    expect(both.isKpiResponsible).toBe(true);
    expect(canAccessAdminPages(both)).toBe(true);
    expect(canEditWeekRetour(both)).toBe(true);
    expect(formatUserBadges(both)).toBe("admin · KPI");
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
  });

  it("normalizeAccessUsers fusionne et exige un admin", () => {
    const normalized = normalizeAccessUsers([
      {
        email: "A@Coverseal.com",
        isAdmin: true,
        isKpiResponsible: false,
      },
      {
        email: "a@coverseal.com",
        isAdmin: false,
        isKpiResponsible: true,
      },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].isAdmin).toBe(true);
    expect(normalized[0].isKpiResponsible).toBe(true);

    const fallback = normalizeAccessUsers([
      { email: "only@x.com", isAdmin: false, isKpiResponsible: true },
    ]);
    expect(fallback.some((u) => u.isAdmin)).toBe(true);
  });
});
