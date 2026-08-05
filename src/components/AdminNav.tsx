"use client";

import { SubNav } from "./SubNav";

const LINKS = [
  { href: "/admin", label: "Vue d’ensemble", exact: true },
  { href: "/admin/personnes", label: "Utilisateurs" },
  { href: "/admin/jira", label: "Intégration Jira" },
  { href: "/admin/operations", label: "Opérations données" },
  { href: "/admin/documentation", label: "Documentation" },
];

export function AdminNav() {
  return <SubNav links={LINKS} label="Sous-menus admin" />;
}
