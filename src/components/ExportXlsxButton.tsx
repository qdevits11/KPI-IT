"use client";

import { useState } from "react";

/**
 * Bouton d’export Excel (.xlsx) — déclenche `onExport` (async) et
 * affiche l’état pending / erreur inline.
 */
export function ExportXlsxButton({
  onExport,
  disabled = false,
  label = "Exporter Excel",
  className = "",
}: {
  onExport: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending || disabled) return;
    setError(null);
    setPending(true);
    try {
      await onExport();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l’export");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled || pending}
        title="Télécharger le tableau en Excel (.xlsx)"
        className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Export…" : label}
      </button>
      {error && (
        <p className="max-w-[16rem] text-xs text-[var(--crit)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
