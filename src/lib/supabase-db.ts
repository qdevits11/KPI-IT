/**
 * Persistance KPI·IT sur Supabase.
 *
 * Domaine KPI → tables relationnelles (voir src/lib/db/relational.ts).
 * Connexion Jira sync → kpi_jira_connection (cipher AES-GCM).
 * Tokens OAuth user (actions tickets) → kpi_user_jira_tokens.
 * Accès serveur uniquement via service_role.
 */

import { blobConfigured } from "./db-persist";
import {
  getServiceClient,
  resetSupabaseClientForTests,
  supabaseConfigured,
} from "./db/client";
import {
  getRelationalStorageCounts,
  invalidateRelationalDbCache,
  relationalReady,
} from "./db/relational";
import { TABLES } from "./db/tables";

export { supabaseConfigured, resetSupabaseClientForTests };
export const KPI_JIRA_CONN_ID = "default";
export const KPI_JIRA_CONN_TABLE = TABLES.jiraConnection;

/** Vitest : oublier client + cache relationnel. */
export function resetSupabaseStateForTests(): void {
  resetSupabaseClientForTests();
  invalidateRelationalDbCache();
}

/** Cipher AES-GCM du compte Jira (email + token), partagé entre périphériques. */
export async function loadJiraCipherFromSupabase(): Promise<string | null> {
  const sb = getServiceClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(KPI_JIRA_CONN_TABLE)
      .select("cipher")
      .eq("id", KPI_JIRA_CONN_ID)
      .maybeSingle();
    if (error) {
      console.warn("Lecture Supabase Jira impossible:", error.message);
      return null;
    }
    const cipher = data?.cipher;
    return typeof cipher === "string" && cipher.length > 0 ? cipher : null;
  } catch (err) {
    console.warn("Lecture Supabase Jira impossible:", err);
    return null;
  }
}

export async function saveJiraCipherToSupabase(cipher: string): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from(KPI_JIRA_CONN_TABLE).upsert(
      {
        id: KPI_JIRA_CONN_ID,
        cipher,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("Écriture Supabase Jira impossible:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Écriture Supabase Jira impossible:", err);
    return false;
  }
}

export async function clearJiraCipherFromSupabase(): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from(KPI_JIRA_CONN_TABLE)
      .delete()
      .eq("id", KPI_JIRA_CONN_ID);
    if (error) {
      console.warn("Suppression Supabase Jira impossible:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Suppression Supabase Jira impossible:", err);
    return false;
  }
}

const USER_JIRA_TOKENS_TABLE = TABLES.userJiraTokens;

/** Cipher AES-GCM des tokens OAuth personnels (actions tickets). */
export async function loadUserJiraCipherFromSupabase(
  email: string,
): Promise<string | null> {
  const sb = getServiceClient();
  if (!sb) return null;
  const key = email.trim().toLowerCase();
  if (!key) return null;
  try {
    const { data, error } = await sb
      .from(USER_JIRA_TOKENS_TABLE)
      .select("cipher")
      .eq("email", key)
      .maybeSingle();
    if (error) {
      console.warn("Lecture tokens Jira user impossible:", error.message);
      return null;
    }
    const cipher = data?.cipher;
    return typeof cipher === "string" && cipher.length > 0 ? cipher : null;
  } catch (err) {
    console.warn("Lecture tokens Jira user impossible:", err);
    return null;
  }
}

export async function saveUserJiraCipherToSupabase(
  email: string,
  cipher: string,
): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  const key = email.trim().toLowerCase();
  if (!key || !cipher) return false;
  try {
    const { error } = await sb.from(USER_JIRA_TOKENS_TABLE).upsert(
      {
        email: key,
        cipher,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    if (error) {
      console.warn("Écriture tokens Jira user impossible:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Écriture tokens Jira user impossible:", err);
    return false;
  }
}

export async function clearUserJiraCipherFromSupabase(
  email: string,
): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  const key = email.trim().toLowerCase();
  if (!key) return false;
  try {
    const { error } = await sb
      .from(USER_JIRA_TOKENS_TABLE)
      .delete()
      .eq("email", key);
    if (error) {
      console.warn("Suppression tokens Jira user impossible:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Suppression tokens Jira user impossible:", err);
    return false;
  }
}

export type StorageBackend = "supabase" | "blob" | "disk";

export interface StorageStatus {
  backend: StorageBackend;
  ok: boolean;
  supabaseConfigured: boolean;
  blobConfigured: boolean;
  /** Mode relationnel (tables). */
  mode?: "relational";
  /** Dernière écriture connue (ISO). */
  updatedAt: string | null;
  weeks: number | null;
  assigneeWeeks: number | null;
  requesterWeeks: number | null;
  revision?: number | null;
  error?: string;
}

/** Diagnostic pour savoir si la prod lit/écrit bien Supabase. */
export async function getStorageStatus(): Promise<StorageStatus> {
  const hasSb = supabaseConfigured();
  const hasBlob = blobConfigured();

  if (hasSb) {
    try {
      const ready = await relationalReady();
      if (ready) {
        const counts = await getRelationalStorageCounts();
        return {
          backend: "supabase",
          ok: true,
          mode: "relational",
          supabaseConfigured: true,
          blobConfigured: hasBlob,
          updatedAt: counts.updatedAt,
          weeks: counts.weeks,
          assigneeWeeks: counts.assigneeWeeks,
          requesterWeeks: counts.requesterWeeks,
          revision: counts.revision,
        };
      }

      return {
        backend: "supabase",
        ok: false,
        supabaseConfigured: true,
        blobConfigured: hasBlob,
        updatedAt: null,
        weeks: null,
        assigneeWeeks: null,
        requesterWeeks: null,
        error: "Schéma relationnel non initialisé (kpi_meta manquant).",
      };
    } catch (err) {
      return {
        backend: "supabase",
        ok: false,
        supabaseConfigured: true,
        blobConfigured: hasBlob,
        updatedAt: null,
        weeks: null,
        assigneeWeeks: null,
        requesterWeeks: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    backend: hasBlob ? "blob" : "disk",
    ok: true,
    supabaseConfigured: false,
    blobConfigured: hasBlob,
    updatedAt: null,
    weeks: null,
    assigneeWeeks: null,
    requesterWeeks: null,
  };
}
