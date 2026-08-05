"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tableau de bord" },
  { href: "/saisie", label: "Encodage" },
  { href: "/configuration", label: "Configuration" },
  { href: "/jira", label: "Sync Jira" },
  { href: "/formules", label: "Formules" },
];

export function AppNav() {
  const pathname = usePathname();

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
        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          {LINKS.map((link) => {
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
      </div>
    </header>
  );
}
