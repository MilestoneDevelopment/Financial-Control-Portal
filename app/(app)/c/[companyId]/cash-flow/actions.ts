"use server";

/**
 * Cash Flow period-setup + opening-balance server actions (Phase 4C).
 *
 * Every mutation is capability-gated at the app layer AND independently enforced
 * at the database: period creation by RLS (periods_write / period.approve_lock),
 * opening-balance writes by the SECURITY DEFINER `set_period_opening_balance`
 * (which checks period.set_opening_balance per company and touches only the
 * opening-balance columns). All are audited and company-scoped.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/data/companies";
import { getActiveVersion } from "@/lib/data/structure";
import { requirePeriodMutable } from "@/lib/domain/period/lifecycle";
import {
  listCashFlowNodes,
  listCashFlowTransactions,
  listCashFlowPeriods,
} from "@/lib/data/cashflow";
import { buildCashFlowTree, computeClosingBalance } from "@/lib/domain/cashflow/generate";
import {
  adjacentPeriods,
  periodDateRange,
  validatePeriodInput,
  validateOpeningBalanceAmount,
} from "@/lib/domain/cashflow/periods";

async function orgIdFor(companyId: string): Promise<string> {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  return company.org_id;
}

function revalidate(companyId: string) {
  revalidatePath(`/c/${companyId}/cash-flow`);
}

/** Create a draft accounting period (capability: period.approve_lock). */
export async function createPeriodAction(input: {
  companyId: string;
  year: number;
  month: number | null;
}): Promise<void> {
  const { year, month } = validatePeriodInput({ year: input.year, month: input.month });

  const supabase = await createClient();
  await requireCapability(supabase, "period.approve_lock", input.companyId);
  const orgId = await orgIdFor(input.companyId);

  // Link to the active structure version when one exists (optional metadata).
  const version = await getActiveVersion(input.companyId);

  const { error } = await supabase.from("periods").insert({
    company_id: input.companyId,
    year,
    month,
    status: "draft",
    structure_version_id: version?.id ?? null,
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
    target: periodDateRange(year, month).label,
    details: { year, month },
  });
  revalidate(input.companyId);
}

/** Set a manual opening balance (capability: period.set_opening_balance). */
export async function setOpeningBalanceAction(input: {
  companyId: string;
  periodId: string;
  amount: number;
}): Promise<void> {
  const amount = validateOpeningBalanceAmount(input.amount);

  const supabase = await createClient();
  await requireCapability(supabase, "period.set_opening_balance", input.companyId);
  const orgId = await orgIdFor(input.companyId);

  // Confirm the period belongs to this company (RLS already scopes reads).
  const { data: period } = await supabase
    .from("periods")
    .select("id, company_id, status, is_correction_mode")
    .eq("id", input.periodId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!period) throw new Error("Period not found.");
  // Locked/closed periods need Correction Mode (existing lifecycle model). The
  // RPC enforces this too; here it yields a clean message before the round-trip.
  requirePeriodMutable({ status: period.status, is_correction_mode: period.is_correction_mode });

  const { error } = await supabase.rpc("set_period_opening_balance", {
    p_period_id: input.periodId,
    p_amount: amount,
    p_source: "manual",
  });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "period.opening_balance.set",
    target: input.periodId,
    details: { amount, source: "manual" },
  });
  revalidate(input.companyId);
}

/**
 * Accept the carried opening balance from the previous period (capability:
 * period.set_opening_balance). The candidate is recomputed server-side
 * (previous opening + previous net) - the client value is never trusted.
 */
export async function acceptCarriedOpeningAction(input: {
  companyId: string;
  periodId: string;
}): Promise<void> {
  const supabase = await createClient();
  await requireCapability(supabase, "period.set_opening_balance", input.companyId);
  const orgId = await orgIdFor(input.companyId);

  const allPeriods = await listCashFlowPeriods(input.companyId);
  const current = allPeriods.find((p) => p.id === input.periodId);
  if (!current) throw new Error("Period not found.");
  // Same lifecycle rule applies to accepting a carried opening.
  requirePeriodMutable({ status: current.status, is_correction_mode: current.isCorrectionMode });

  const { previous } = adjacentPeriods(allPeriods, input.periodId);
  if (!previous || previous.openingBalance === null) {
    throw new Error("No carried opening balance is available from the previous period.");
  }

  const nodes = await listCashFlowNodes(input.companyId);
  const prevTxns = await listCashFlowTransactions(input.companyId, {
    dateFrom: previous.dateFrom,
    dateTo: previous.dateTo,
  });
  const prevNet = buildCashFlowTree(nodes, prevTxns).net;
  const candidate = computeClosingBalance(previous.openingBalance, prevNet);
  if (candidate === null) {
    throw new Error("Previous period closing balance is not available.");
  }
  const amount = validateOpeningBalanceAmount(candidate);

  const { error } = await supabase.rpc("set_period_opening_balance", {
    p_period_id: input.periodId,
    p_amount: amount,
    p_source: "carried",
  });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "period.opening_balance.carried",
    target: input.periodId,
    details: { amount, fromPeriodId: previous.id },
  });
  revalidate(input.companyId);
}
