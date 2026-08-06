"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export function LoginPanel({
  oauthConfigured,
}: {
  oauthConfigured: boolean;
}) {
  const searchParams = useSearchParams();
  const next = useMemo(() => {
    const raw = searchParams.get("next") || "/";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) {
      return "/";
    }
    return raw;
  }, [searchParams]);
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error ?? "Connexion impossible");
        return;
      }
      window.location.href = next;
    } finally {
      setBusy(false);
    }
  }

  const oauthHref = `/api/jira/oauth/start?next=${encodeURIComponent(next)}`;

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-1">
      <div
        className="pointer-events-none absolute -inset-x-10 -top-16 h-64 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 20% 40%, rgba(15,118,110,0.22), transparent 70%), radial-gradient(ellipse 60% 50% at 90% 20%, rgba(19,32,51,0.12), transparent 65%)",
        }}
      />

      <div className="relative space-y-8 animate-[rise-in_0.55s_ease_both]">
        <header className="space-y-4 text-center sm:text-left">
          <p className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--ink)] sm:text-5xl">
            KPI<span className="text-[var(--accent)]">·</span>IT
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink-soft)] sm:text-2xl">
            Connexion Coverseal
          </h1>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Identifiez-vous pour ouvrir l’application. La synchronisation Jira
            utilise toujours le token partagé configuré dans Sync Jira — pas
            votre session personnelle.
          </p>
        </header>

        {(error || localError) && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--crit)] animate-[rise-in_0.4s_ease_both]">
            {localError || error}
          </p>
        )}

        {oauthConfigured ? (
          <div className="space-y-3">
            <a
              href={oauthHref}
              className="inline-flex w-full items-center justify-center rounded-md bg-[var(--ink)] px-5 py-3.5 text-sm font-medium text-[var(--paper)] transition-transform hover:scale-[1.01] hover:bg-[var(--ink-soft)]"
            >
              Se connecter avec Microsoft / Atlassian
            </a>
            <p className="text-center text-xs text-[var(--muted)]">
              Sur l’écran Atlassian, choisissez Microsoft si votre organisation
              l’utilise.
            </p>
          </div>
        ) : (
          <form onSubmit={emailLogin} className="space-y-4">
            <p className="text-xs text-[var(--warn)]">
              OAuth non configuré — connexion par email (droits déjà définis
              dans Configuration).
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--ink-soft)]">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@coverseal.com"
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--ink-soft)]">
                Nom (optionnel)
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white hover:bg-[var(--accent-deep)] disabled:opacity-60"
            >
              {busy ? "…" : "Entrer dans KPI·IT"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
