"use client";

/**
 * Browser Supabase client (anon key). Safe for client components.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/db/types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
