import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFIG, isSupabaseConfigured } from "./config";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!adminClient) {
    adminClient = createClient(CONFIG.SUPABASE_URL as string, CONFIG.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}
