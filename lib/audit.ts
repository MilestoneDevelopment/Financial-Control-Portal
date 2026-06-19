import "server-only";

/**
 * Append-only audit logging. Every privileged mutation should call this.
 * RLS allows insert only for orgs the user belongs to; the table has no
 * update/delete policy, so entries are immutable for normal users.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/types";

type Severity = Database["public"]["Enums"]["audit_severity"];

export interface AuditEntry {
  orgId: string;
  companyId?: string | null;
  action: string;
  target?: string | null;
  details?: Record<string, unknown>;
  severity?: Severity;
}

export async function logAudit(
  supabase: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    org_id: entry.orgId,
    company_id: entry.companyId ?? null,
    action: entry.action,
    target: entry.target ?? null,
    details: (entry.details ?? {}) as Database["public"]["Tables"]["audit_log"]["Insert"]["details"],
    severity: entry.severity ?? "ok",
  });
  // Audit failures must never silently pass - surface them to the caller.
  if (error) throw new Error(`audit_log insert failed: ${error.message}`);
}
