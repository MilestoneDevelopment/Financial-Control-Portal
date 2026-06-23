"use server";

/**
 * Period lifecycle server actions (foundation). Capability-gated, audited, and
 * revalidating. RLS enforces the same capabilities at the database.
 *
 *   create / transition / set opening balance -> period.approve_lock / .set_opening_balance
 *   correction mode (locked|closed edits)     -> period.correction_mode (+ reason, audited)
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/data/companies";
import { canTransition, requirePeriodMutable, type PeriodStatus } from "@/lib/domain/period/lifecycle";
import type { Database } from "@/db/types";

async function ctx(companyId: string) {
  const supabase = await createClient();
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  return { supabase, orgId: company.org_id, userId: user.id };
}

function revalidate(companyId: string) {
  revalidatePath(`/c/${companyId}/dashboard`);
}

export async function createPeriodAction(input: {
  companyId: string;
  year: number;
  month: number;
}): Promise<void> {
  if (input.month < 1 || input.month > 12) throw new Error("Month must be 1-12.");
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "period.approve_lock", input.companyId);

  // Pin the currently active structure version (historical periods keep it).
  const { data: version } = await supabase
    .from("cf_structure_versions")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("status", "active")
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Carry opening balance from the most recent prior period with a closing balance.
  const { data: priors } = await supabase
    .from("periods")
    .select("year, month, closing_balance")
    .eq("company_id", input.companyId)
    .not("closing_balance", "is", null)
    .order("year", { ascending: false })
    .order("month", { ascending: false, nullsFirst: false });
  const prior = (priors ?? []).find(
    (p) =>
      p.year < input.year ||
      (p.year === input.year && (p.month ?? 0) < input.month),
  );

  const { error } = await supabase.from("periods").insert({
    company_id: input.companyId,
    year: input.year,
    month: input.month,
    status: "draft",
    structure_version_id: version?.id ?? null,
    opening_balance: prior?.closing_balance ?? null,
    opening_balance_source: prior ? "carried" : null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("This period already exists.");
    }
    throw new Error(error.message);
  }
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "period.created",
    target: `${input.year}-${String(input.month).padStart(2, "0")}`,
  });
  revalidate(input.companyId);
}

export async function transitionPeriodAction(input: {
  companyId: string;
  periodId: string;
  to: PeriodStatus;
}): Promise<void> {
  const { supabase, orgId, userId } = await ctx(input.companyId);
  await requireCapability(supabase, "period.approve_lock", input.companyId);

  const { data: period } = await supabase
    .from("periods")
    .select("status")
    .eq("id", input.periodId)
    .maybeSingle();
  if (!period) throw new Error("Period not found.");
  if (!canTransition(period.status, input.to)) {
    throw new Error(`Cannot move ${period.status} -> ${input.to}.`);
  }

  const patch: Database["public"]["Tables"]["periods"]["Update"] = { status: input.to };
  const now = new Date().toISOString();
  if (input.to === "locked") {
    patch.locked_by = userId;
    patch.locked_at = now;
  }
  if (input.to === "closed") {
    patch.closed_by = userId;
    patch.closed_at = now;
  }

  const { error } = await supabase.from("periods").update(patch).eq("id", input.periodId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "period.transition",
    target: input.periodId,
    details: { from: period.status, to: input.to },
    severity: input.to === "locked" || input.to === "closed" ? "warn" : "ok",
  });
  revalidate(input.companyId);
}

export async function setCorrectionModeAction(input: {
  companyId: string;
  periodId: string;
  on: boolean;
  reason: string;
}): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "period.correction_mode", input.companyId);
  if (input.on && !input.reason.trim()) {
    throw new Error("A reason is required to enable Correction Mode.");
  }

  const { error } = await supabase
    .from("periods")
    .update({
      is_correction_mode: input.on,
      correction_reason: input.on ? input.reason.trim() : null,
    })
    .eq("id", input.periodId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: input.on ? "period.correction_mode.enabled" : "period.correction_mode.disabled",
    target: input.periodId,
    details: input.on ? { reason: input.reason.trim() } : {},
    severity: "warn",
  });
  revalidate(input.companyId);
}

export async function setOpeningBalanceAction(input: {
  companyId: string;
  periodId: string;
  amount: number;
}): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "period.set_opening_balance", input.companyId);
  if (!Number.isFinite(input.amount)) throw new Error("Opening balance must be a number.");

  // Lifecycle guard (same rule as Cash Flow): locked/closed need Correction Mode.
  const { data: period } = await supabase
    .from("periods")
    .select("status, is_correction_mode")
    .eq("id", input.periodId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!period) throw new Error("Period not found.");
  requirePeriodMutable({ status: period.status, is_correction_mode: period.is_correction_mode });

  // Write through the guarded RPC so the DB-level lifecycle guard is consistently
  // enforced (the RPC also checks period.set_opening_balance and stamps set_by).
  const { error } = await supabase.rpc("set_period_opening_balance", {
    p_period_id: input.periodId,
    p_amount: input.amount,
    p_source: "manual",
  });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "period.opening_balance.set",
    target: input.periodId,
    details: { amount: input.amount, source: "manual" },
    severity: "warn",
  });
  revalidate(input.companyId);
}
