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
import {
  classifyTransaction,
  ruleMatchesTx,
  type ClassRule,
  type ClassifiableTx,
} from "@/lib/domain/classification/engine";
import { validateRuleInput, type RuleInput } from "@/lib/domain/classification/rules";
import { rerunStatuses, type RerunOptions } from "@/lib/domain/classification/coverage";
import type { Database } from "@/db/types";

type DbRule = Database["public"]["Tables"]["classification_rules"]["Row"];

function toClassRule(r: DbRule): ClassRule {
  return {
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
  };
}

function ruleInputToDbFields(c: RuleInput) {
  return {
    class_id: c.classId,
    name: c.name,
    rule_type: c.ruleType,
    priority: c.priority,
    confidence_score: c.confidenceScore,
    is_active: c.isActive,
    debit_account_pattern: c.debitAccountPattern,
    credit_account_pattern: c.creditAccountPattern,
    description_pattern: c.descriptionPattern,
    currency: c.currency,
    min_amount: c.minAmount,
    max_amount: c.maxAmount,
    cash_direction: c.cashDirection,
  };
}

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
  includeUnclassified?: boolean;
  includeSuggested?: boolean;
  overwriteRuleConfirmed?: boolean;
}): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.run", input.companyId);

  const opts: RerunOptions = {
    includeUnclassified: input.includeUnclassified ?? true,
    includeSuggested: input.includeSuggested ?? true,
    overwriteRuleConfirmed: input.overwriteRuleConfirmed ?? false,
  };
  const statuses = rerunStatuses(opts);
  if (statuses.length === 0) throw new Error("Select at least one row set to classify.");

  const { data: dbRules } = await supabase
    .from("classification_rules")
    .select("*")
    .eq("company_id", input.companyId)
    .eq("is_active", true)
    .order("priority", { ascending: true });
  const rules: ClassRule[] = (dbRules ?? []).map(toClassRule);

  // Targeted statuses; never manual rows (source filter keeps manual out even if
  // 'confirmed' is included for rule-overwrite).
  let q = supabase
    .from("transactions")
    .select("id, debit_account, credit_account, description, original_amount, amount_gel, original_currency")
    .eq("company_id", input.companyId)
    .in("classification_status", statuses)
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
    details: { processed: txs?.length ?? 0, classified, needsReview, unclassified, fileId: input.fileId ?? null, options: opts },
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

// ---------------------------------------------------------------------------
// Rule management (Phase 3B)
// ---------------------------------------------------------------------------

export async function createRuleAction(input: { companyId: string } & RuleInput): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.manage_rules", input.companyId);
  const { ok, errors, cleaned } = validateRuleInput(input);
  if (!ok) throw new Error(errors.join(" "));
  await assertClassInActiveStructure(supabase, input.companyId, cleaned.classId);

  const { error } = await supabase.from("classification_rules").insert({
    org_id: orgId,
    company_id: input.companyId,
    ...ruleInputToDbFields(cleaned),
  });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.rule.created",
    target: cleaned.name,
    details: { classId: cleaned.classId, ruleType: cleaned.ruleType },
  });
  revalidatePath(`/c/${input.companyId}/classification/rules`);
}

export async function updateRuleAction(input: { companyId: string; ruleId: string } & RuleInput): Promise<void> {
  const { supabase, orgId, userId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.manage_rules", input.companyId);
  const { ok, errors, cleaned } = validateRuleInput(input);
  if (!ok) throw new Error(errors.join(" "));
  await assertClassInActiveStructure(supabase, input.companyId, cleaned.classId);

  const { error } = await supabase
    .from("classification_rules")
    .update({ ...ruleInputToDbFields(cleaned), updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", input.ruleId)
    .eq("company_id", input.companyId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.rule.updated",
    target: input.ruleId,
    details: { name: cleaned.name, ruleType: cleaned.ruleType },
  });
  revalidatePath(`/c/${input.companyId}/classification/rules`);
}

export async function setRuleActiveAction(input: {
  companyId: string;
  ruleId: string;
  active: boolean;
}): Promise<void> {
  const { supabase, orgId, userId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.manage_rules", input.companyId);
  const { error } = await supabase
    .from("classification_rules")
    .update({ is_active: input.active, updated_by: userId, updated_at: new Date().toISOString() })
    .eq("id", input.ruleId)
    .eq("company_id", input.companyId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: input.active ? "classification.rule.enabled" : "classification.rule.disabled",
    target: input.ruleId,
  });
  revalidatePath(`/c/${input.companyId}/classification/rules`);
}

export async function deleteRuleAction(input: { companyId: string; ruleId: string }): Promise<void> {
  const { supabase, orgId } = await ctx(input.companyId);
  await requireCapability(supabase, "classification.manage_rules", input.companyId);
  // Detach the rule from any transactions it classified (keep the rows classified).
  await supabase
    .from("transactions")
    .update({ matched_rule_id: null })
    .eq("company_id", input.companyId)
    .eq("matched_rule_id", input.ruleId);
  const { error } = await supabase
    .from("classification_rules")
    .delete()
    .eq("id", input.ruleId)
    .eq("company_id", input.companyId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "classification.rule.deleted",
    target: input.ruleId,
    severity: "warn",
  });
  revalidatePath(`/c/${input.companyId}/classification/rules`);
}

export interface PreviewRow {
  id: string;
  date: string | null;
  description: string | null;
  debit: string | null;
  credit: string | null;
  amount: number | null;
  currency: Database["public"]["Enums"]["currency"] | null;
  status: Database["public"]["Enums"]["tx_classification_status"];
  source: Database["public"]["Enums"]["classification_source"] | null;
  wouldMatch: boolean;
}

/** Read-only: which current transactions a (possibly unsaved) rule would match. */
export async function previewRuleAction(input: {
  companyId: string;
  rule: RuleInput;
  includeClassified?: boolean;
}): Promise<PreviewRow[]> {
  const supabase = await createClient();
  await requireCapability(supabase, "classification.run", input.companyId);
  // Preview is read-only and may be unsaved -> match conditions are validated, but
  // a rule name is not required.
  const { ok, errors, cleaned } = validateRuleInput(input.rule, { requireName: false });
  if (!ok) throw new Error(errors.join(" "));

  const candidate: ClassRule = {
    id: "preview",
    classId: cleaned.classId,
    ruleType: cleaned.ruleType,
    priority: cleaned.priority,
    isActive: true,
    debitAccountPattern: cleaned.debitAccountPattern,
    creditAccountPattern: cleaned.creditAccountPattern,
    descriptionPattern: cleaned.descriptionPattern,
    currency: cleaned.currency,
    minAmount: cleaned.minAmount,
    maxAmount: cleaned.maxAmount,
    cashDirection: cleaned.cashDirection,
    confidenceScore: cleaned.confidenceScore,
  };

  let q = supabase
    .from("transactions")
    .select("id, transaction_date, description, debit_account, credit_account, original_amount, original_currency, amount_gel, classification_status, classification_source")
    .eq("company_id", input.companyId);
  if (!input.includeClassified) q = q.in("classification_status", ["unclassified", "suggested"]);
  const { data, error } = await q.order("transaction_date", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((t) => ({
    id: t.id,
    date: t.transaction_date,
    description: t.description,
    debit: t.debit_account,
    credit: t.credit_account,
    amount: t.original_amount !== null ? Number(t.original_amount) : null,
    currency: t.original_currency,
    status: t.classification_status,
    source: t.classification_source,
    wouldMatch: ruleMatchesTx(
      {
        debitAccount: t.debit_account,
        creditAccount: t.credit_account,
        description: t.description,
        originalAmount: t.original_amount !== null ? Number(t.original_amount) : null,
        amountGel: t.amount_gel !== null ? Number(t.amount_gel) : null,
        currency: t.original_currency,
      },
      candidate,
    ),
  }));
}
