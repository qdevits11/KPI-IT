import { Suspense } from "react";
import { LoginPanel } from "@/components/LoginPanel";
import { atlassianOAuthConfigured } from "@/lib/jira-oauth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const oauthConfigured = atlassianOAuthConfigured();

  return (
    <Suspense
      fallback={
        <p className="text-center text-sm text-[var(--muted)]">Chargement…</p>
      }
    >
      <LoginPanel oauthConfigured={oauthConfigured} />
    </Suspense>
  );
}
