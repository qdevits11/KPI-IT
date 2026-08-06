/**
 * Persistance KPI·IT sur Supabase.
 *
 * Domaine KPI → tables relationnelles (voir src/lib/db/relational.ts).
 * Connexion Jira → kpi_jira_connection (cipher AES-GCM).
 * Accès serveur uniquement via service_role.
 */

import { blobConfigured } from "./db-persist";
import {
  getServiceClient,
  resetSupabaseClientForTests,
  supabaseConfigured,
} from "./db/client";
import { getRelationalStorageCounts, relationalReady } from "./db/relational";
import { KPI_META_ID, TABLES } from "./db/tables";

export { supabaseConfigured, resetSupabaseClientForTests };
export const KPI_APP_STATE_ID = "default";
export const KPI_APP_STATE_TABLE = TABLES.appStateArchive;
export const KPI_JIRA_CONN_ID = "default";
export const KPI_JIRA_CONN_TABLE = TABLES.jiraConnection;

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

export type StorageBackend = "supabase" | "blob" | "disk";

export interface StorageStatus {
  backend: StorageBackend;
  ok: boolean;
  supabaseConfigured: boolean;
  blobConfigured: boolean;
  /** Mode relationnel (tables) vs archive JSON. */
  mode?: "relational" | "document-archive";
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

      // Fallback diagnostic sur l’archive JSON
      const sb = getServiceClient()!;
      const { data, error } = await sb
        .from(KPI_APP_STATE_TABLE)
        .select("updated_at")
        .eq("id", KPI_META_ID)
        .maybeSingle();
      if (error) {
        return {
          backend: "supabase",
          ok: false,
          supabaseConfigured: true,
          blobConfigured: hasBlob,
          updatedAt: null,
          weeks: null,
          assigneeWeeks: null,
          requesterWeeks: null,
          error: error.message,
        };
      }
      return {
        backend: "supabase",
        ok: Boolean(data),
        mode: "document-archive",
        supabaseConfigured: true,
        blobConfigured: hasBlob,
        updatedAt: data?.updated_at ?? null,
        weeks: null,
        assigneeWeeks: null,
        requesterWeeks: null,
        error: data
          ? "Schéma relationnel non initialisé (kpi_meta manquant)."
          : "Aucune donnée Supabase.",
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
