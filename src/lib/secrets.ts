/**
 * Secrets applicatifs (chiffrement cookies / credentials Jira).
 *
 * Ordre : JIRA_COOKIE_SECRET → NEXTAUTH_SECRET → (optionnel) fallbacks métier
 * → constante de développement.
 *
 * En production sans secret dédié : on log un warning mais on ne bloque pas
 * la connexion (déploiements existants). Définir JIRA_COOKIE_SECRET sur Vercel.
 */

const DEV_FALLBACK = "kpi-it-dev-secret-change-me";

const warned = new Set<string>();

function warnOnce(purpose: string, detail: string): void {
  if (warned.has(purpose)) return;
  warned.add(purpose);
  console.warn(`[kpi-secret] ${purpose}: ${detail}`);
}

export function resolveAppSecret(
  purpose: string,
  extraFallbacks: Array<string | undefined> = [],
): string {
  const primary =
    process.env.JIRA_COOKIE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (primary) return primary;

  for (const candidate of extraFallbacks) {
    const value = candidate?.trim();
    if (value) {
      warnOnce(
        purpose,
        "JIRA_COOKIE_SECRET absent — fallback secondaire utilisé. Définissez JIRA_COOKIE_SECRET sur Vercel.",
      );
      return value;
    }
  }

  warnOnce(
    purpose,
    "aucun secret configuré — fallback de développement. Définissez JIRA_COOKIE_SECRET (ou NEXTAUTH_SECRET) en production.",
  );
  return DEV_FALLBACK;
}
