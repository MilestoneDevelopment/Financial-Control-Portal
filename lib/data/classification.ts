import "server-only";

/**
 * Classification read queries. RLS scopes results to accessible companies.
 * Engine logic is pure in lib/domain/classification/*.
 */
import type { Database } from "@/db/types";
import { createClient } from "@/lib/supabase/server";
import { getActiveVersion, getNodes } from "@/lib/data/structure";

export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
export type ClassificationRule = Database["public"]["Tables"]["classification_rules"]["Row"];
export type CashDirection = Database["public"]["Enums"]["cash_direction"];

export interface ClassOption {
  id: string;
  label: string;
  cashDirection: CashDirection;
}

/** Active class nodes of the company's active structure version. */
export async function listActiveClasses(companyId: string): Promise<ClassOption[]> {
  const version = await getActiveVersion(companyId);
  if (!version) return [];
  const nodes = await getNodes(version.id);
  return nodes
    .filter((n) => n.kind === "class" && n.is_active)
    .map((n) => ({ id: n.id, label: n.label, cashDirection: n.cash_direction }));
}

export interface TxFilters {
  fileId?: string;
  status?: Database["public"]["Enums"]["tx_classification_status"];
  currency?: Database["public"]["Enums"]["currency"];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listTransactionsForReview(
  companyId: string,
  filters: TxFilters = {},
): Promise<TransactionRow[]> {
  const supabase = await createClient();
  let q = supabase.from("transactions").select("*").eq("company_id", companyId);
  if (filters.fileId) q = q.eq("file_id", filters.fileId);
  if (filters.status) q = q.eq("classification_status", filters.status);
  if (filters.currency) q = q.eq("original_currency", filters.currency);
  if (filters.dateFrom) q = q.gte("transaction_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("transaction_date", filters.dateTo);
  if (filters.search) {
    // Strip characters that would break the PostgREST or-filter grammar.
    const s = filters.search.replace(/[,()*%]/g, " ").trim();
    if (s) q = q.or(`description.ilike.%${s}%,debit_account.ilike.%${s}%,credit_account.ilike.%${s}%`);
  }
  const { data, error } = await q
    .order("transaction_date", { ascending: true, nullsFirst: false })
    .order("row_index", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listActiveRules(companyId: string): Promise<ClassificationRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classification_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
