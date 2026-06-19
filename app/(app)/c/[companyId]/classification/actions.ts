"use server";

/**
 * Classification server actions (Phase 3A foundation). Capability-gated, audited.
 * Manual assignment sets classification_source = manual and is never overwritten
 * by the rule engine. The engine (classification.run) only touches unclassified /
 * needs-review (suggested) rows that are not manually classified.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/data/companies";
import { getActiveVersion } from "@/lib/data/structure";
import { classifyTransaction, type ClassRule, type ClassifiableTx } from "@/lib/domain/classification/engine";

async function ctx(companyId: string) {
  const supabase = await createClient();
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  return { supabase, orgId: company.org_id, userId: user.id };
}

/** Ensure a class belongs to the company's active structure version. */
async function assertClassInActiveStructure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  classId: string,
): Promise<void> {
  const version = await getActiveVersion(companyId);
  if (!version) throw new Error("No active structure version for this company.");
  const { data: node } = await supabase
    .from("cf_nodes")
    .select("id")
    .eq("id", classId)
    .eq("company_id", companyId)
    .eq("kind", "class")
    .eq("is_active", true)
    .eq("structure_version_id", version.id)
    .maybeSingle();
  if (!node) throw new Error("Class not found in the active structure (or inactive).");
}

async function assignManual(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  classId: string,
  txIds: string[],
  userId: string,
): Promise<void> {
  await assertClassInActiveStructure(supabase, companyId, classId);
  const { error } = await supabase
    .from("transactions")
    .update({
      class_id: classId,
      classification_status: "confirmed",
      classification_source: "manual",
      classification_confidence: 1,
      classified_by: userId,
      classified_at: new Date().toISOString(),
      matched_rule_id: null,
    })
    .in("id", txIds)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
}

export async function assignClassAction(input: {
  companyId: string;
  transactionId: string;
  classId: string;
}): Promise<void> {
  const { supabase, orgId, userId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.assign", input.companyId);
  await assignManual(supabase, input.companyId, input.classId, [input.transactionId], userId);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.assigned",
    target: input.transactionId,
    details: { classId: input.classId, source: "manual", count: 1 },
  });
  revalidatePath(`/c/${input.companyId}/classification`);
}

export async function bulkAssignClassAction(input: {
  companyId: string;
  transactionIds: string[];
  classId: string;
}): Promise<void> {
  if (input.transactionIds.length === 0) throw new Error("No transactions selected.");
  const { supabase, orgId, userId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.assign", input.companyId);
  await assignManual(supabase, input.companyId, input.classId, input.transactionIds, userId);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.assigned",
    target: input.classId,
    details: { classId: input.classId, source: "manual", count: input.transactionIds.length },
  });
  revalidatePath(`/c/${input.companyId}/classification`);
}

export async function runClassificationAction(input: {
  companyId: string;
  fileId?: string | null;
}): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.run", input.companyId);

  const { data: dbRules } = await supabase
    .from("classification_rules")
    .select("*")
    .eq("company_id", input.companyId)
    .eq("is_active", true)
    .order("priority", { ascending: true });
  const rules: ClassRule[] = (dbRules ?? []).map((r) => ({
    id: r.id,
    classId: r.class_id,
    ruleType: r.rule_type,
    priority: r.priority,
    isActive: r.is_active,
    debitAccountPattern: r.debit_account_pattern,
    creditAccountPattern: r.credit_account_pattern,
    descriptionPattern: r.description_pattern,
    currency: r.currency,
    minAmount: r.min_amount !== null ? Number(r.min_amount) : null,
    maxAmount: r.max_amount !== null ? Number(r.max_amount) : null,
    cashDirection: r.cash_direction,
    confidenceScore: Number(r.confidence_score),
  }));

  // Only unclassified / needs-review rows, never manual ones.
  let q = supabase
    .from("transactions")
    .select("id, debit_account, credit_account, description, original_amount, amount_gel, original_currency")
    .eq("company_id", input.companyId)
    .in("classification_status", ["unclassified", "suggested"])
    .or("classification_source.is.null,classification_source.eq.rule");
  if (input.fileId) q = q.eq("file_id", input.fileId);
  const { data: txs, error } = await q;
  if (error) throw new Error(error.message);

  let classified = 0;
  let needsReview = 0;
  let unclassified = 0;
  const now = new Date().toISOString();

  for (const t of txs ?? []) {
    const txInput: ClassifiableTx = {
      debitAccount: t.debit_account,
      creditAccount: t.credit_account,
      description: t.description,
      originalAmount: t.original_amount !== null ? Number(t.original_amount) : null,
      amountGel: t.amount_gel !== null ? Number(t.amount_gel) : null,
      currency: t.original_currency,
    };
    const res = classifyTransaction(txInput, rules);
    if (res.status === "confirmed") classified += 1;
    else if (res.status === "suggested") needsReview += 1;
    else unclassified += 1;

    await supabase
      .from("transactions")
      .update({
        class_id: res.classId,
        classification_status: res.status,
        classification_source: res.classId ? "rule" : null,
        classification_confidence: res.confidence,
        matched_rule_id: res.matchedRuleId,
        classified_at: res.classId ? now : null,
      })
      .eq("id", t.id)
      .eq("company_id", input.companyId);
  }

  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.run",
    target: input.fileId ?? "all",
    details: { processed: txs?.length ?? 0, classified, needsReview, unclassified, fileId: input.fileId ?? null },
    severity: needsReview > 0 ? "warn" : "ok",
  });
  revalidatePath(`/c/${input.companyId}/classification`);
}

/** Optional: persist a reusable account-pair rule from a manual assignment. */
export async function createRuleFromTransactionAction(input: {
  companyId: string;
  transactionId: string;
  classId: string;
  name: string;
}): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.manage_rules", input.companyId);
  await assertClassInActiveStructure(supabase, input.companyId, input.classId);

  const { data: tx } = await supabase
    .from("transactions")
    .select("debit_account, credit_account")
    .eq("id", input.transactionId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!tx) throw new Error("Transaction not found.");
  if (!tx.debit_account || !tx.credit_account) {
    throw new Error("Transaction lacks debit/credit accounts to build an account-pair rule.");
  }

  const { error } = await supabase.from("classification_rules").insert({
    org_id: orgId,
    company_id: input.companyId,
    class_id: input.classId,
    name: input.name.trim() || `${tx.debit_account}/${tx.credit_account}`,
    rule_type: "account_pair",
    debit_account_pattern: tx.debit_account,
    credit_account_pattern: tx.credit_account,
    priority: 50,
    confidence_score: 0.95,
  });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.rule.created",
    target: input.name,
    details: { classId: input.classId, debit: tx.debit_account, credit: tx.credit_account },
  });
  revalidatePath(`/c/${input.companyId}/classification`);
}
