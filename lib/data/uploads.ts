import "server-only";

/**
 * Accounting upload read queries. RLS scopes every result to companies the
 * current user can access. Pure status/parse helpers live in lib/domain/upload/*.
 */
import type { Database } from "@/db/types";
import { createClient } from "@/lib/supabase/server";

export type AccountingFile = Database["public"]["Tables"]["accounting_files"]["Row"];
export type AccountingFileIssue = Database["public"]["Tables"]["accounting_file_issues"]["Row"];

export async function listAccountingFiles(companyId: string): Promise<AccountingFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_files")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAccountingFile(id: string): Promise<AccountingFile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("accounting_files")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function listFileIssues(fileId: string): Promise<AccountingFileIssue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_file_issues")
    .select("*")
    .eq("file_id", fileId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCompanyIssues(companyId: string): Promise<AccountingFileIssue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_file_issues")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
