"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SubNavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

export function SubNav({
  links,
  label,
}: {
  links: SubNavLink[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-3"
    >
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
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
