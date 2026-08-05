"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import type { AppUser } from "@/lib/roles";
import { formatUserBadges, isAdminNavHref } from "@/lib/roles";
import { PersonAvatar } from "./PersonAvatar";

const SIDEBAR_COLLAPSED_KEY = "kpi-sidebar-collapsed";

const LINKS = [
  { href: "/semaine", label: "Semaine", short: "Se" },
  { href: "/tickets-ouverts", label: "Tickets", short: "Ti" },
  { href: "/analyse", label: "Analyse", short: "An" },
  { href: "/saisie", label: "Encodage", short: "En" },
  { href: "/admin", label: "Admin", short: "Ad" },
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

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const panelId = useId();
  const [user, setUser] = useState<AppUser | null>(null);
  const [adminPages, setAdminPages] = useState(false);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [, startTransition] = useTransition();

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

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

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col border-r border-[var(--line)] bg-[var(--surface)]/95 shadow-xl backdrop-blur-md transition-[transform,width] duration-300 ease-out lg:static lg:z-0 lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:backdrop-blur-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-[4.25rem]" : "lg:w-60"}`}
      >
        <div
          className={`flex items-center border-b border-[var(--line)] ${
            collapsed ? "lg:flex-col lg:gap-2 lg:px-2 lg:py-3" : "justify-between"
          }`}
        >
          <Link
            href="/semaine"
            onClick={() => setOpen(false)}
            className={`flex items-baseline gap-2 py-4 ${
              collapsed ? "lg:px-0 lg:py-1" : "px-4"
            }`}
            title="KPI·IT"
          >
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
              {collapsed ? (
                <span className="hidden lg:inline">
                  K<span className="text-[var(--accent)]">·</span>
                </span>
              ) : null}
              <span className={collapsed ? "lg:hidden" : undefined}>
                KPI<span className="text-[var(--accent)]">·</span>IT
              </span>
            </span>
            <span
              className={`text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              Coverseal
            </span>
          </Link>

          <div
            className={`flex items-center gap-1 ${
              collapsed ? "lg:w-full lg:justify-center" : "mr-3"
            }`}
          >
            <button
              type="button"
              aria-label={
                collapsed ? "Agrandir le menu" : "Réduire le menu"
              }
              aria-pressed={collapsed}
              onClick={toggleCollapsed}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--wash)] hover:text-[var(--ink)] lg:inline-flex"
              title={collapsed ? "Agrandir" : "Réduire"}
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)] lg:hidden"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <nav
          aria-label="Navigation principale"
          className={`flex flex-col gap-1 p-3 ${collapsed ? "lg:px-2" : ""}`}
        >
          {visibleLinks.map((link) => {
            const active = linkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                title={link.label}
                className={`rounded-lg text-sm font-medium transition-colors duration-200 ${
                  collapsed
                    ? "lg:flex lg:h-10 lg:items-center lg:justify-center lg:px-0"
                    : "px-3 py-2.5"
                } ${
                  active
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                }`}
              >
                <span className={collapsed ? "lg:hidden" : undefined}>
                  {link.label}
                </span>
                <span
                  className={`hidden font-[family-name:var(--font-display)] text-xs tracking-wide ${
                    collapsed ? "lg:inline" : ""
                  }`}
                  aria-hidden
                >
                  {link.short}
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          className={`mt-auto border-t border-[var(--line)] p-4 ${
            collapsed ? "lg:p-2" : ""
          }`}
        >
          {user ? (
            <div className={`space-y-3 ${collapsed ? "lg:space-y-2" : ""}`}>
              <div
                className={`flex items-center gap-2.5 ${
                  collapsed ? "lg:justify-center" : ""
                }`}
                title={`${user.displayName || user.email} · ${formatUserBadges(user)}`}
              >
                <PersonAvatar
                  name={user.displayName || user.email}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                />
                <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
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
                title="Quitter la session"
                className={`w-full rounded-lg border border-[var(--line)] text-left text-sm text-[var(--muted)] transition-colors hover:bg-[var(--wash)] hover:text-[var(--ink)] ${
                  collapsed
                    ? "px-3 py-2 lg:flex lg:h-10 lg:items-center lg:justify-center lg:px-0"
                    : "px-3 py-2"
                }`}
              >
                <span className={collapsed ? "lg:hidden" : undefined}>
                  Quitter la session
                </span>
                <LogoutGlyph
                  className={`hidden ${collapsed ? "lg:block" : ""}`}
                />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              title="Se connecter"
              className={`block rounded-lg border border-[var(--line)] text-sm text-[var(--muted)] transition-colors hover:bg-[var(--wash)] hover:text-[var(--ink)] ${
                collapsed
                  ? "px-3 py-2 lg:flex lg:h-10 lg:items-center lg:justify-center lg:px-0"
                  : "px-3 py-2"
              }`}
            >
              <span className={collapsed ? "lg:hidden" : undefined}>
                Se connecter
              </span>
              <LoginGlyph className={`hidden ${collapsed ? "lg:block" : ""}`} />
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

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d={collapsed ? "M7 5.5L10 8L7 10.5" : "M9 5.5L6 8L9 10.5"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 3v10"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity={collapsed ? 0.35 : 1}
      />
    </svg>
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

function LogoutGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M7 8h6m0 0-2-2m2 2-2 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoginGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M9 3h2.5A1.5 1.5 0 0 1 13 4.5v7A1.5 1.5 0 0 1 11.5 13H9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9 8H3m0 0 2-2M3 8l2 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
