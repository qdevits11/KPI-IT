import { describe, expect, it } from "vitest";
import {
  buildAppUser,
  canAccessAdminPages,
  canEditWeekRetour,
  isAdmin,
  isKpiResponsible,
  roleForEmail,
} from "./roles";

describe("roles", () => {
  it("reconnaît l’admin Coverseal", () => {
    expect(roleForEmail("q.devits@coverseal.com")).toBe("admin");
    expect(roleForEmail("Q.Devits@Coverseal.com")).toBe("admin");
    expect(isAdmin(buildAppUser("q.devits@coverseal.com"))).toBe(true);
    expect(canAccessAdminPages(buildAppUser("q.devits@coverseal.com"))).toBe(
      true,
    );
    expect(canEditWeekRetour(buildAppUser("q.devits@coverseal.com"))).toBe(
      true,
    );
  });

  it("traite les autres emails comme users", () => {
    const u = buildAppUser("colleague@coverseal.com", "Colleague");
    expect(u.role).toBe("user");
    expect(canAccessAdminPages(u)).toBe(false);
    expect(isKpiResponsible(u)).toBe(false);
    expect(canEditWeekRetour(u)).toBe(false);
  });

  it("refuse null", () => {
    expect(canAccessAdminPages(null)).toBe(false);
    expect(canEditWeekRetour(null)).toBe(false);
  });
});
