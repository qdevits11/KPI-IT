/**
 * Secrets applicatifs — interdit le fallback hardcodé en production.
 */

export function resolveAppSecret(purpose: string): string {
  const raw =
    process.env.JIRA_COOKIE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (raw) return raw;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Secret manquant pour ${purpose}: définissez JIRA_COOKIE_SECRET (ou NEXTAUTH_SECRET) en production.`,
    );
  }

  return "kpi-it-dev-secret-change-me";
}
