import "server-only";

/**
 * Period read queries. Pure lifecycle helpers live in
 * lib/domain/period/lifecycle.ts and are re-exported here for convenience.
 */
import type { Database } from "@/db/types";
import { createClient } from "@/lib/supabase/server";

export type Period = Database["public"]["Tables"]["periods"]["Row"];

export type { PeriodStatus } from "@/lib/domain/period/lifecycle";
export {
  PERIOD_STATUS_LABEL,
  ALLOWED_TRANSITIONS,
  canTransition,
  isPeriodMutable,
  requirePeriodMutable,
  periodLabel,
} from "@/lib/domain/period/lifecycle";

export async function listPeriods(companyId: string): Promise<Period[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("periods")
    .select("*")
    .eq("company_id", companyId)
    .order("year", { ascending: false })
    .order("month", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPeriod(id: string): Promise<Period | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("periods").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}
