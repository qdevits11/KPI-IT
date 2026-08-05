/**
 * Persistance KPI·IT sur Supabase (source de vérité en production).
 *
 * Accès serveur uniquement via service_role — jamais exposé au navigateur.
 * Table : public.kpi_app_state (document JSONB singleton).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "./types";
import { blobConfigured } from "./db-persist";

export const KPI_APP_STATE_ID = "default";
export const KPI_APP_STATE_TABLE = "kpi_app_state";
export const KPI_JIRA_CONN_ID = "default";
export const KPI_JIRA_CONN_TABLE = "kpi_jira_connection";

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

let client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return client;
}

/** Vitest : oublier le client après changement d’env. */
export function resetSupabaseClientForTests(): void {
  client = null;
}

export async function loadDbFromSupabase(): Promise<AppDatabase | null> {
  const sb = getServiceClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from(KPI_APP_STATE_TABLE)
      .select("data")
      .eq("id", KPI_APP_STATE_ID)
      .maybeSingle();
    if (error) {
      console.warn("Lecture Supabase KPI impossible:", error.message);
      return null;
    }
    if (!data?.data) return null;
    return data.data as AppDatabase;
  } catch (err) {
    console.warn("Lecture Supabase KPI impossible:", err);
    return null;
  }
}

export async function saveDbToSupabase(db: AppDatabase): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  try {
    const { error } = await sb.from(KPI_APP_STATE_TABLE).upsert(
      {
        id: KPI_APP_STATE_ID,
        data: db,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("Écriture Supabase KPI impossible:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Écriture Supabase KPI impossible:", err);
    return false;
  }
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

export type StorageBackend = "supabase" | "blob" | "disk";

export interface StorageStatus {
  backend: StorageBackend;
  ok: boolean;
  supabaseConfigured: boolean;
  blobConfigured: boolean;
  /** Dernière écriture connue dans Supabase (ISO), si joignable. */
  updatedAt: string | null;
  weeks: number | null;
  assigneeWeeks: number | null;
  requesterWeeks: number | null;
  error?: string;
}

/** Diagnostic pour savoir si la prod lit/écrit bien Supabase. */
export async function getStorageStatus(): Promise<StorageStatus> {
  const hasSb = supabaseConfigured();
  const hasBlob = blobConfigured();

  if (hasSb) {
    const sb = getServiceClient()!;
    try {
      const { data, error } = await sb
        .from(KPI_APP_STATE_TABLE)
        .select("data, updated_at")
        .eq("id", KPI_APP_STATE_ID)
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
      const payload = data?.data as AppDatabase | undefined;
      return {
        backend: "supabase",
        ok: Boolean(data),
        supabaseConfigured: true,
        blobConfigured: hasBlob,
        updatedAt: data?.updated_at ?? null,
        weeks: payload?.weeks?.length ?? 0,
        assigneeWeeks: Object.keys(payload?.ticketsByAssignee ?? {}).length,
        requesterWeeks: Object.keys(payload?.ticketsByRequester ?? {}).length,
        error: data ? undefined : "Aucune ligne kpi_app_state (seed au prochain write).",
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
