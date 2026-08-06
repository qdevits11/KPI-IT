/**
 * Client Supabase service_role (serveur uniquement).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient | null {
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
