"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/statistiques", label: "Vue d’ensemble", exact: true },
  { href: "/tickets-ouverts", label: "Ouverts (live)" },
  { href: "/statistiques/par-assigne", label: "Par assigné" },
  { href: "/statistiques/par-demandeur", label: "Par demandeur" },
  { href: "/statistiques/par-type", label: "Par type" },
];

export function StatsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sous-menus statistiques"
      className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-3"
    >
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
