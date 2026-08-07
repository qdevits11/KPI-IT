import type { Metadata } from "next";
import { Sora, Source_Sans_3 } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { PeopleProvider } from "@/components/PeopleProvider";
import "./globals.css";

const display = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "KPI·IT — Coverseal",
  description:
    "Tableau de bord des indicateurs du service IT : Jira, appareils, Odoo, automatisations, phishing et maintenance production.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full font-[family-name:var(--font-body)] antialiased">
        <PeopleProvider>
          <AppShell>
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
              {children}
            </main>
          </AppShell>
        </PeopleProvider>
      </body>
    </html>
  );
}
