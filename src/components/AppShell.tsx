"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import type { AppUser } from "@/lib/roles";
import { formatUserBadges, isAdminNavHref } from "@/lib/roles";
import { PersonAvatar } from "./PersonAvatar";

const LINKS = [
  { href: "/semaine", label: "Semaine" },
  { href: "/tickets-ouverts", label: "Tickets" },
  { href: "/analyse", label: "Analyse" },
  { href: "/saisie", label: "Encodage" },
  { href: "/admin", label: "Admin" },
];

function linkActive(pathname: string, href: string): boolean {
  if (href === "/analyse") {
    return pathname === "/analyse" || pathname.startsWith("/analyse/");
  }
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const panelId = useId();
  const [user, setUser] = useState<AppUser | null>(null);
  const [adminPages, setAdminPages] = useState(false);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me");
    if (!res.ok) return;
    const json = (await res.json()) as {
      user: AppUser | null;
      permissions?: { adminPages?: boolean };
    };
    startTransition(() => {
      setUser(json.user);
      setAdminPages(Boolean(json.permissions?.adminPages));
    });
  }, []);

  useEffect(() => {
    if (isLogin) return;
    void loadMe();
  }, [loadMe, pathname, isLogin]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function logoutSession() {
    await fetch("/api/me", { method: "DELETE" });
    setUser(null);
    setAdminPages(false);
    window.location.assign("/login");
  }

  if (isLogin) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
              KPI<span className="text-[var(--accent)]">·</span>IT
            </span>
          </div>
        </header>
        {children}
      </div>
    );
  }

  const visibleLinks = LINKS.filter((link) => {
    if (isAdminNavHref(link.href)) return adminPages;
    return true;
  });

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Barre mobile / tablette */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)]/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--wash)]"
        >
          <BurgerIcon open={open} />
        </button>
        <Link
          href="/semaine"
          className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]"
        >
          KPI<span className="text-[var(--accent)]">·</span>IT
        </Link>
        <div className="w-10" aria-hidden />
      </header>

      {/* Overlay mobile */}
      <div
        className={`fixed inset-0 z-40 bg-[var(--ink)]/35 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      {/* Sidebar laptop + tiroir mobile */}
      <aside
        id={panelId}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col border-r border-[var(--line)] bg-[var(--surface)]/95 shadow-xl backdrop-blur-md transition-transform duration-300 ease-out lg:static lg:z-0 lg:w-60 lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:backdrop-blur-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)]">
          <Link
            href="/semaine"
            onClick={() => setOpen(false)}
            className="flex items-baseline gap-2 px-4 py-4"
          >
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
              KPI<span className="text-[var(--accent)]">·</span>IT
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              Coverseal
            </span>
          </Link>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)] lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <nav
          aria-label="Navigation principale"
          className="flex flex-col gap-1 p-3"
        >
          {visibleLinks.map((link) => {
            const active = linkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--line)] p-4">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <PersonAvatar
                  name={user.displayName || user.email}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--ink)]">
                    {user.displayName || user.email}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {formatUserBadges(user)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void logoutSession()}
                className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm text-[var(--muted)] transition-colors hover:bg-[var(--wash)] hover:text-[var(--ink)]"
              >
                Quitter la session
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--wash)] hover:text-[var(--ink)]"
            >
              Se connecter
            </Link>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-3.5 w-4" aria-hidden>
      <span
        className={`absolute left-0 block h-0.5 w-4 rounded-full bg-current transition-all duration-300 ${
          open ? "top-1.5 rotate-45" : "top-0"
        }`}
      />
      <span
        className={`absolute left-0 top-1.5 block h-0.5 w-4 rounded-full bg-current transition-opacity duration-300 ${
          open ? "opacity-0" : "opacity-100"
        }`}
      />
      <span
        className={`absolute left-0 block h-0.5 w-4 rounded-full bg-current transition-all duration-300 ${
          open ? "top-1.5 -rotate-45" : "top-3"
        }`}
      />
    </span>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
