/**
 * Persistance KPI·IT sur Supabase (source de vérité en production).
 *
 * Accès serveur uniquement via service_role — jamais exposé au navigateur.
 * Table : public.kpi_app_state (document JSONB singleton).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "./types";

export const KPI_APP_STATE_ID = "default";
export const KPI_APP_STATE_TABLE = "kpi_app_state";

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
