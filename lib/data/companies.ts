import "server-only";

/**
 * Company read queries. RLS scopes every result to companies the current user
 * can access (direct or org-level membership).
 */
import type { Database } from "@/db/types";
import { createClient } from "@/lib/supabase/server";

export type Company = Database["public"]["Tables"]["companies"]["Row"];

export async function listAccessibleCompanies(): Promise<Company[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Default active company for shell fallback (first active, else first accessible). */
export function pickDefaultCompany(companies: Company[]): Company | null {
  if (companies.length === 0) return null;
  return companies.find((c) => c.status === "active") ?? companies[0];
}
