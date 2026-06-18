import "server-only";

/**
 * Privileged Supabase client (service-role key). BYPASSES RLS.
 *
 * Use ONLY in trusted server-side code for operations that legitimately need to
 * cross tenant boundaries (e.g. provisioning an org's system roles, background
 * jobs). Never import this into client code and never expose the key.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import { getSupabaseUrl } from "./env";

export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Required for privileged server operations.",
    );
  }
  return createSupabaseClient<Database>(getSupabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
