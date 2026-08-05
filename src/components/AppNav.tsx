"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AppUser } from "@/lib/roles";
import { formatUserBadges, isAdminNavHref } from "@/lib/roles";

const LINKS = [
  { href: "/semaine", label: "Semaine en cours" },
  { href: "/tickets-ouverts", label: "Tickets ouverts" },
  { href: "/", label: "Tableau de bord" },
  { href: "/vue", label: "Vue annuelle" },
  { href: "/statistiques", label: "Statistiques" },
  { href: "/saisie", label: "Encodage" },
  { href: "/configuration", label: "Configuration" },
  { href: "/jira", label: "Sync Jira" },
  { href: "/formules", label: "Formules" },
];

export function AppNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null>(null);
  const [adminPages, setAdminPages] = useState(false);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me");
    if (!res.ok) return;
    const json = (await res.json()) as {
      user: AppUser | null;
      permissions?: { adminPages?: boolean };
    };
    setUser(json.user);
    setAdminPages(Boolean(json.permissions?.adminPages));
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe, pathname]);

  async function logoutSession() {
    await fetch("/api/me", { method: "DELETE" });
    setUser(null);
    setAdminPages(false);
    window.location.href = "/login";
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return (
      <header className="border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
            KPI<span className="text-[var(--accent)]">·</span>IT
          </span>
        </div>
      </header>
    );
  }

  const visibleLinks = LINKS.filter((link) => {
    if (isAdminNavHref(link.href)) return adminPages;
    return true;
  });

  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)] sm:text-2xl">
            KPI<span className="text-[var(--accent)]">·</span>IT
          </span>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-[var(--muted)] sm:inline">
            Coverseal
          </span>
        </Link>
        <div className="flex flex-col items-end gap-1">
          <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
            {visibleLinks.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-[var(--muted)]">
            {user ? (
              <>
                <span>
                  {user.displayName || user.email}
                  {" · "}
                  {formatUserBadges(user)}
                </span>
                <button
                  type="button"
                  onClick={() => void logoutSession()}
                  className="underline-offset-2 hover:underline"
                >
                  Quitter la session
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="underline-offset-2 hover:underline"
              >
                Se connecter
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
