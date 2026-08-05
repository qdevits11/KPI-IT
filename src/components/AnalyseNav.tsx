"use client";

import { SubNav } from "./SubNav";

const LINKS = [
  { href: "/analyse", label: "KPI année", exact: true },
  { href: "/analyse/tickets", label: "Tickets (résumé)", exact: true },
  { href: "/analyse/par-assigne", label: "Par assigné" },
  { href: "/analyse/par-demandeur", label: "Par demandeur" },
  { href: "/analyse/par-type", label: "Par type" },
];

export function AnalyseNav() {
  return <SubNav links={LINKS} label="Sous-menus analyse" />;
}
